from typing import Optional, Dict, Any, List, Callable
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import httpx
import asyncio
from datetime import datetime, timedelta
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

class PolicyPack:
    def __init__(self, data: Dict[str, Any]):
        self.id = data.get("id")
        self.name = data.get("name")
        self.requires_capabilities = data.get("requires_capabilities", [])
        self.min_assurance = data.get("min_assurance")
        self.limits_required = data.get("limits_required", [])
        self.enforcement = data.get("enforcement", {})

class PassportData:
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

class PolicyResult:
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
                headers={"User-Agent": "AgentPassportMiddleware/1.0"}
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

# ============================================================================
# STANDARD MIDDLEWARE APPROACH: Create middleware with explicit agent ID
# ============================================================================

def create_agent_passport_middleware(
    agent_id: str,
    config: Optional[PolicyEnforcementConfig] = None
) -> Callable:
    """Create middleware with explicit agent ID"""
    if config is None:
        config = PolicyEnforcementConfig()
    
    async def middleware(request: Request, call_next):
        if not config.enabled:
            return await call_next(request)
        
        # Get policy ID from request state or headers
        policy_id = getattr(request.state, 'policy_id', None) or request.headers.get("x-policy-id")
        if not policy_id:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "policy_id_required",
                    "message": "Policy ID must be specified"
                }
            )
        
        # Get context from request state or body
        context = getattr(request.state, 'policy_context', None)
        if context is None:
            try:
                context = await request.json()
            except:
                context = {}
        
        # Verify policy compliance
        policy_response = await verify_policy_compliance(agent_id, policy_id, context, config)
        
        if not policy_response:
            if config.fail_closed:
                raise HTTPException(
                    status_code=500,
                    detail={
                        "error": "policy_verification_failed",
                        "message": "Failed to verify policy compliance"
                    }
                )
            else:
                logger.warning("Policy verification failed, allowing request to proceed")
                return await call_next(request)
        
        if not policy_response.get("allow"):
            if config.log_violations:
                logger.warning(f"Policy violation for agent {agent_id}: {policy_response.get('reason')}")
            
            if config.fail_closed:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": "policy_violation",
                        "message": policy_response.get("reason", "Policy violation"),
                        "violations": policy_response.get("violations", []),
                        "agent_id": agent_id,
                        "policy_id": policy_id
                    }
                )
            else:
                logger.warning("Policy violation detected, allowing request to proceed")
                return await call_next(request)
        
        # Policy verification passed - attach result to request
        policy = await fetch_policy_pack(policy_id, config)
        if policy:
            request.state.policy_result = convert_policy_response(policy_response, policy)
        
        return await call_next(request)
    
    return middleware

# ============================================================================
# CONVENIENCE FUNCTIONS: Require specific policy with explicit agent ID
# ============================================================================

def require_policy(
    policy_id: str,
    agent_id: str,
    config: Optional[PolicyEnforcementConfig] = None
) -> Callable:
    """Require specific policy with explicit agent ID"""
    async def dependency(request: Request):
        # Set the policy ID in request state
        request.state.policy_id = policy_id
        
        middleware = create_agent_passport_middleware(agent_id, config)
        return await middleware(request, lambda req: None)
    
    return Depends(dependency)

def require_policy_with_context(
    policy_id: str,
    agent_id: str,
    context: Dict[str, Any],
    config: Optional[PolicyEnforcementConfig] = None
) -> Callable:
    """Require policy with context from business logic"""
    async def dependency(request: Request):
        # Set the policy ID and context in request state
        request.state.policy_id = policy_id
        request.state.policy_context = context
        
        middleware = create_agent_passport_middleware(agent_id, config)
        return await middleware(request, lambda req: None)
    
    return Depends(dependency)

# ============================================================================
# GLOBAL MIDDLEWARE: Apply to all routes with explicit agent ID
# ============================================================================

def agent_passport_middleware(
    agent_id: str,
    config: Optional[PolicyEnforcementConfig] = None
) -> Callable:
    """Global middleware that applies when policy ID is set"""
    middleware = create_agent_passport_middleware(agent_id, config)
    
    async def global_middleware(request: Request, call_next):
        # Only apply if policy ID is set
        if hasattr(request.state, 'policy_id') or request.headers.get("x-policy-id"):
            return await middleware(request, call_next)
        return await call_next(request)
    
    return global_middleware

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_policy_result(request: Request) -> Optional[PolicyResult]:
    """Get policy result from request"""
    return getattr(request.state, 'policy_result', None)

def has_policy_access(request: Request) -> bool:
    """Check if request passed policy validation"""
    result = get_policy_result(request)
    return result and all(result.checks.values()) if result else False

def get_agent_passport(request: Request) -> Optional[PassportData]:
    """Get agent passport data from request"""
    result = get_policy_result(request)
    return result.passport if result else None

def get_policy(request: Request) -> Optional[PolicyPack]:
    """Get policy data from request"""
    result = get_policy_result(request)
    return result.policy if result else None
