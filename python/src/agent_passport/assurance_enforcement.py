"""
Assurance Enforcement for Agent Passport SDK

Provides minimum assurance level enforcement for relying parties using Agent Passport.
This allows platforms to require specific assurance levels for different operations.
"""

from typing import Dict, Optional, List, Any
from pydantic import BaseModel
from enum import Enum
import re


class AssuranceLevel(str, Enum):
    """Assurance level enumeration"""
    L0 = "L0"  # self-attested
    L1 = "L1"  # email_verified
    L2 = "L2"  # github_verified
    L3 = "L3"  # domain_verified
    L4KYC = "L4KYC"  # kyc_verified / kyb_verified
    L4FIN = "L4FIN"  # financial_data_verified


class AssuranceEnforcementConfig(BaseModel):
    """Configuration for assurance enforcement"""
    enabled: bool = True
    strict_mode: bool = True  # If True, reject requests that don't meet minimum assurance
    log_violations: bool = True  # Log assurance violations for monitoring
    default_minimum: Optional[AssuranceLevel] = AssuranceLevel.L1  # Default minimum assurance level
    route_requirements: Dict[str, AssuranceLevel] = {
        # Payment operations - as specified in Epic F acceptance criteria
        "/api/payments/refund": AssuranceLevel.L2,  # Refunds require L2+ (GitHub verified)
        "/api/payments/payout": AssuranceLevel.L3,  # Payouts require L3+ (Domain verified)
        "/payments/refund": AssuranceLevel.L2,  # Alternative path
        "/payments/payout": AssuranceLevel.L3,  # Alternative path
        "/refunds": AssuranceLevel.L2,  # Shorthand path
        "/payouts": AssuranceLevel.L3,  # Shorthand path
        
        # Administrative operations
        "/admin": AssuranceLevel.L4KYC,  # Admin functions require KYC
        "/api/admin": AssuranceLevel.L4KYC,
        
        # Financial data operations
        "/financial": AssuranceLevel.L4FIN,  # Financial data requires financial verification
        "/api/financial": AssuranceLevel.L4FIN,
        "/banking": AssuranceLevel.L4FIN,
        "/api/banking": AssuranceLevel.L4FIN,
        
        # High-value operations
        "/transfers": AssuranceLevel.L3,  # Money transfers require domain verification
        "/api/transfers": AssuranceLevel.L3,
        "/withdrawals": AssuranceLevel.L3,  # Withdrawals require domain verification
        "/api/withdrawals": AssuranceLevel.L3,
    }


class AssuranceLevelMetadata(BaseModel):
    """Metadata for assurance levels"""
    level: AssuranceLevel
    name: str
    description: str
    requirements: List[str]
    risk_level: str
    order: int
    color: str
    icon: str


# Assurance level metadata registry
ASSURANCE_LEVEL_METADATA: Dict[AssuranceLevel, AssuranceLevelMetadata] = {
    AssuranceLevel.L0: AssuranceLevelMetadata(
        level=AssuranceLevel.L0,
        name="Self-Attested",
        description="Owner self-declares identity without verification",
        requirements=["Self-declaration"],
        risk_level="very_high",
        order=0,
        color="#EF4444",  # Red
        icon="warning",
    ),
    AssuranceLevel.L1: AssuranceLevelMetadata(
        level=AssuranceLevel.L1,
        name="Email Verified",
        description="Email address verified through confirmation link",
        requirements=["Valid email address", "Email confirmation"],
        risk_level="high",
        order=1,
        color="#F59E0B",  # Amber
        icon="mail",
    ),
    AssuranceLevel.L2: AssuranceLevelMetadata(
        level=AssuranceLevel.L2,
        name="GitHub Verified",
        description="GitHub account verified and linked",
        requirements=["GitHub account", "Public profile", "Repository access"],
        risk_level="medium",
        order=2,
        color="#3B82F6",  # Blue
        icon="github",
    ),
    AssuranceLevel.L3: AssuranceLevelMetadata(
        level=AssuranceLevel.L3,
        name="Domain Verified",
        description="Domain ownership verified via DNS TXT or /.well-known/agent-owner.json",
        requirements=["Domain ownership", "DNS TXT record or /.well-known/agent-owner.json"],
        risk_level="low",
        order=3,
        color="#10B981",  # Green
        icon="globe",
    ),
    AssuranceLevel.L4KYC: AssuranceLevelMetadata(
        level=AssuranceLevel.L4KYC,
        name="KYC/KYB Verified",
        description="Know Your Customer/Business verification completed",
        requirements=["Government ID", "Address verification", "Business registration"],
        risk_level="low",
        order=4,
        color="#8B5CF6",  # Purple
        icon="shield-check",
    ),
    AssuranceLevel.L4FIN: AssuranceLevelMetadata(
        level=AssuranceLevel.L4FIN,
        name="Financial Data Verified",
        description="Financial data and banking information verified",
        requirements=["Bank account verification", "Financial statements", "Tax records"],
        risk_level="low",
        order=5,
        color="#059669",  # Emerald
        icon="bank",
    ),
}


def meets_minimum_assurance(current_level: str, required_level: str) -> bool:
    """Check if current assurance level meets minimum requirement"""
    try:
        current = AssuranceLevel(current_level)
        required = AssuranceLevel(required_level)
        
        current_order = ASSURANCE_LEVEL_METADATA[current].order
        required_order = ASSURANCE_LEVEL_METADATA[required].order
        
        return current_order >= required_order
    except (ValueError, KeyError):
        return False


def get_required_assurance_level(path: str, config: AssuranceEnforcementConfig) -> Optional[AssuranceLevel]:
    """Get required assurance level for a specific route"""
    # Check for exact path match first
    if path in config.route_requirements:
        return config.route_requirements[path]
    
    # Check for pattern matches
    for pattern, level in config.route_requirements.items():
        if path.startswith(pattern):
            return level
    
    # Return default minimum if set
    return config.default_minimum


def get_operation_from_path(path: str) -> str:
    """Extract operation type from request path"""
    if "refund" in path:
        return "payment_refund"
    elif "payout" in path:
        return "payment_payout"
    elif "transfer" in path:
        return "money_transfer"
    elif "withdrawal" in path:
        return "withdrawal"
    elif "admin" in path:
        return "admin_operation"
    elif "financial" in path or "banking" in path:
        return "financial_operation"
    else:
        return "protected_operation"


def get_upgrade_instructions(current_level: str, required_level: str) -> str:
    """Get upgrade instructions based on current and required levels"""
    upgrade_map = {
        "L0": {
            "L1": "Verify your email address to reach L1 assurance",
            "L2": "Verify your email address, then connect your GitHub account to reach L2",
            "L3": "Verify your email, connect GitHub, then verify domain ownership to reach L3",
            "L4KYC": "Complete email verification, GitHub connection, domain verification, and KYC process",
            "L4FIN": "Complete all verification steps including financial data verification",
        },
        "L1": {
            "L2": "Connect your GitHub account to reach L2 assurance",
            "L3": "Connect GitHub account, then verify domain ownership to reach L3",
            "L4KYC": "Connect GitHub, verify domain ownership, then complete KYC process",
            "L4FIN": "Complete all verification steps including financial data verification",
        },
        "L2": {
            "L3": "Verify domain ownership to reach L3 assurance",
            "L4KYC": "Verify domain ownership, then complete KYC process",
            "L4FIN": "Complete domain verification and financial data verification",
        },
        "L3": {
            "L4KYC": "Complete KYC/KYB verification process",
            "L4FIN": "Complete financial data verification process",
        },
        "L4KYC": {
            "L4FIN": "Complete financial data verification process",
        },
    }
    
    return upgrade_map.get(current_level, {}).get(required_level, 
        f"Contact support for guidance on upgrading from {current_level} to {required_level}")


def check_assurance_requirement(
    agent_assurance_level: str,
    path: str,
    config: AssuranceEnforcementConfig
) -> Dict[str, Any]:
    """
    Check if agent meets assurance requirements for a given path.
    
    Args:
        agent_assurance_level: Current assurance level of the agent
        path: Request path to check
        config: Assurance enforcement configuration
        
    Returns:
        Dictionary with check results and error details if applicable
    """
    # Get required assurance level for this route
    required_level = get_required_assurance_level(path, config)
    
    if not required_level:
        # No requirement for this route
        return {"allowed": True, "reason": None}
    
    # Check if agent meets minimum assurance
    meets_requirement = meets_minimum_assurance(agent_assurance_level, required_level.value)
    
    if not meets_requirement:
        current_metadata = ASSURANCE_LEVEL_METADATA.get(AssuranceLevel(agent_assurance_level))
        required_metadata = ASSURANCE_LEVEL_METADATA.get(required_level)
        
        return {
            "allowed": False,
            "reason": "insufficient_assurance",
            "current_level": agent_assurance_level,
            "current_level_name": current_metadata.name if current_metadata else "Unknown",
            "required_level": required_level.value,
            "required_level_name": required_metadata.name if required_metadata else "Unknown",
            "path": path,
            "operation": get_operation_from_path(path),
            "upgrade_instructions": get_upgrade_instructions(agent_assurance_level, required_level.value),
            "docs_url": "https://aport.io/docs/assurance-levels",
        }
    
    return {"allowed": True, "reason": None}


# Convenience functions for common assurance levels
def require_email_verified(agent_assurance_level: str) -> bool:
    """Check if agent has email verification (L1+)"""
    return meets_minimum_assurance(agent_assurance_level, AssuranceLevel.L1.value)


def require_github_verified(agent_assurance_level: str) -> bool:
    """Check if agent has GitHub verification (L2+)"""
    return meets_minimum_assurance(agent_assurance_level, AssuranceLevel.L2.value)


def require_domain_verified(agent_assurance_level: str) -> bool:
    """Check if agent has domain verification (L3+)"""
    return meets_minimum_assurance(agent_assurance_level, AssuranceLevel.L3.value)


def require_kyc_verified(agent_assurance_level: str) -> bool:
    """Check if agent has KYC verification (L4KYC+)"""
    return meets_minimum_assurance(agent_assurance_level, AssuranceLevel.L4KYC.value)


def require_financial_verified(agent_assurance_level: str) -> bool:
    """Check if agent has financial verification (L4FIN+)"""
    return meets_minimum_assurance(agent_assurance_level, AssuranceLevel.L4FIN.value)
