"""
Policy Enforcement for Agent Passport SDK

Provides policy-based enforcement capabilities for agent passports.
"""

from typing import Optional, Dict, Any, List
from dataclasses import dataclass
import httpx
import asyncio
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)


@dataclass
class PolicyPack:
    """Policy pack data structure"""
    def __init__(self, data: Dict[str, Any]):
        self.id = data.get("id")
        self.name = data.get("name")
        self.requires_capabilities = data.get("requires_capabilities", [])
        self.min_assurance = data.get("min_assurance")
        self.limits_required = data.get("limits_required", [])
        self.enforcement = data.get("enforcement", {})


@dataclass
class PassportData:
    """Passport data structure"""
    def __init__(self, data: Dict[str, Any]):
        self.agent_id = data.get("agent_id")
        self.name = data.get("name")
        self.status = data.get("status")
        self.capabilities = data.get("capabilities", [])
        self.limits = data.get("limits", {})
        self.regions = data.get("regions", [])
        self.assurance_level = data.get("assurance_level")
        self.assurance_method = data.get("assurance_method")
        self.assurance_verified_at = data.get("assurance_verified_at")


@dataclass
class PolicyResult:
    """Policy evaluation result"""
    def __init__(self, passport: PassportData, policy: PolicyPack, checks: Dict[str, bool]):
        self.passport = passport
        self.policy = policy
        self.checks = checks


@dataclass
class PolicyEnforcementConfig:
    """Configuration for policy enforcement"""
    api_base_url: str = "https://api.aport.io"
    cache_ttl: int = 60
    fail_closed: bool = True
    enabled: bool = True
    strict_mode: bool = True
    log_violations: bool = True


# Global cache for policy packs and verification results
_policy_cache: Dict[str, Dict[str, Any]] = {}
_verification_cache: Dict[str, Dict[str, Any]] = {}


async def fetch_policy_pack(policy_id: str, config: PolicyEnforcementConfig) -> Optional[PolicyPack]:
    """Fetch policy pack from API"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{config.api_base_url}/api/policies/{policy_id}")
            if response.status_code == 200:
                data = response.json()
                return PolicyPack(data)
    except Exception as e:
        logger.error(f"Error fetching policy pack {policy_id}: {e}")
    return None


async def verify_policy_compliance(
    agent_id: str,
    policy_id: str,
    context: Dict[str, Any],
    config: PolicyEnforcementConfig
) -> Optional[Dict[str, Any]]:
    """Verify policy compliance using server-side policy verification"""
    cache_key = f"policy:{policy_id}:{agent_id}"
    cached = _verification_cache.get(cache_key)
    
    if cached and cached.get("expires", 0) > datetime.now().timestamp():
        return cached.get("result")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{config.api_base_url}/api/verify/policy/{policy_id}",
                json={
                    "agent_id": agent_id,
                    "context": context or {}
                },
                headers={"User-Agent": "AgentPassportSDK/1.0"}
            )
            
            if response.status_code == 200:
                result = response.json()
                
                # Cache successful verifications
                if result.get("allow"):
                    _verification_cache[cache_key] = {
                        "result": result,
                        "expires": datetime.now().timestamp() + config.cache_ttl
                    }
                
                return result
            else:
                logger.error(f"Policy verification failed: {response.status_code} {response.text}")
                return None
                
    except Exception as e:
        logger.error(f"Error verifying policy compliance: {e}")
        return None


def convert_policy_response(response: Dict[str, Any], policy: PolicyPack) -> PolicyResult:
    """Convert policy response to internal format"""
    passport_data = response.get("passport", {})
    evaluation = passport_data.get("evaluation", {})
    
    return PolicyResult(
        passport=PassportData({
            "agent_id": passport_data.get("agent_id"),
            "name": passport_data.get("agent_id"),  # Use agent_id as name if not available
            "status": passport_data.get("status"),
            "capabilities": passport_data.get("capabilities", []),
            "limits": passport_data.get("limits", {}),
            "regions": passport_data.get("regions", []),
            "assurance_level": passport_data.get("assurance_level"),
            "assurance_method": "api_verification",
            "assurance_verified_at": datetime.now().isoformat()
        }),
        policy=policy,
        checks={
            "capability": evaluation.get("capability_ok", False),
            "assurance": evaluation.get("assurance_ok", False),
            "limits": evaluation.get("limits_ok", False),
            "regions": evaluation.get("regions_ok", False)
        }
    )


async def check_policy_compliance(
    agent_id: str,
    policy_id: str,
    context: Optional[Dict[str, Any]] = None,
    config: Optional[PolicyEnforcementConfig] = None
) -> Dict[str, Any]:
    """
    Check policy compliance for an agent.
    
    Args:
        agent_id: Agent ID to check
        policy_id: Policy ID to check against
        context: Additional context for policy evaluation
        config: Policy enforcement configuration
        
    Returns:
        Dictionary with check results and error details if applicable
    """
    if config is None:
        config = PolicyEnforcementConfig()
    
    if not config.enabled:
        return {"allowed": True, "reason": None}
    
    try:
        # Verify policy compliance
        policy_response = await verify_policy_compliance(agent_id, policy_id, context or {}, config)
        
        if not policy_response:
            if config.fail_closed:
                return {
                    "allowed": False,
                    "reason": "policy_verification_failed",
                    "error": "Failed to verify policy compliance"
                }
            else:
                logger.warning("Policy verification failed, allowing request to proceed")
                return {"allowed": True, "reason": None}
        
        if not policy_response.get("allow"):
            if config.log_violations:
                logger.warning(f"Policy violation for agent {agent_id}: {policy_response.get('reason')}")
            
            if config.fail_closed:
                return {
                    "allowed": False,
                    "reason": "policy_violation",
                    "error": policy_response.get("reason", "Policy violation"),
                    "violations": policy_response.get("violations", []),
                    "agent_id": agent_id,
                    "policy_id": policy_id
                }
            else:
                logger.warning("Policy violation detected, allowing request to proceed")
                return {"allowed": True, "reason": None}
        
        # Policy verification passed
        policy = await fetch_policy_pack(policy_id, config)
        if policy:
            policy_result = convert_policy_response(policy_response, policy)
            return {
                "allowed": True,
                "reason": None,
                "policy_result": policy_result
            }
        
        return {"allowed": True, "reason": None}
        
    except Exception as e:
        logger.error(f"Error checking policy compliance: {e}")
        if config.fail_closed:
            return {
                "allowed": False,
                "reason": "policy_check_error",
                "error": "Failed to check policy compliance"
            }
        return {"allowed": True, "reason": None}


def check_policy_sync(
    agent_id: str,
    policy_id: str,
    context: Optional[Dict[str, Any]] = None,
    config: Optional[PolicyEnforcementConfig] = None
) -> Dict[str, Any]:
    """
    Synchronous wrapper for policy compliance checking.
    
    Args:
        agent_id: Agent ID to check
        policy_id: Policy ID to check against
        context: Additional context for policy evaluation
        config: Policy enforcement configuration
        
    Returns:
        Dictionary with check results and error details if applicable
    """
    try:
        # Run the async function in a new event loop
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(
                check_policy_compliance(agent_id, policy_id, context, config)
            )
        finally:
            loop.close()
    except Exception as e:
        logger.error(f"Error in sync policy check: {e}")
        return {
            "allowed": False,
            "reason": "policy_check_error",
            "error": "Failed to check policy compliance"
        }


def clear_policy_cache():
    """Clear the policy verification cache"""
    global _verification_cache, _policy_cache
    _verification_cache.clear()
    _policy_cache.clear()
