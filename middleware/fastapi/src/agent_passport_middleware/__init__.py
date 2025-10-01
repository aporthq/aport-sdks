"""FastAPI middleware for Agent Passport verification."""

from .middleware import (
    AgentPassportMiddleware,
    AgentPassportMiddlewareOptions,
    require_policy,
    require_policy_with_context,
    require_refund_policy,
    require_data_export_policy,
    require_messaging_policy,
    require_repository_policy,
    # Direct SDK functions
    get_decision_token,
    validate_decision_token,
    validate_decision_token_local,
    get_passport_view,
    get_jwks,
    verify_refund,
    verify_release,
    verify_data_export,
    verify_messaging,
    verify_repository,
    agent_passport_middleware,  # Alias for backward compatibility
)

# Re-export SDK types for convenience
from agent_passport import (
    AportError, 
    PolicyVerificationResponse,
    APortClient,
    APortClientOptions,
    PolicyVerifier,
    Jwks,
    Decision,
    DecisionReason,
    VerificationContext,
    PolicyVerificationRequest,
    PassportData,
    AgentPassport,
)

__all__ = [
    # Middleware classes
    "AgentPassportMiddleware",
    "AgentPassportMiddlewareOptions", 
    
    # Middleware functions
    "require_policy",
    "require_policy_with_context",
    "require_refund_policy",
    "require_data_export_policy",
    "require_messaging_policy",
    "require_repository_policy",
    
    # Direct SDK functions
    "get_decision_token",
    "validate_decision_token",
    "validate_decision_token_local",
    "get_passport_view",
    "get_jwks",
    "verify_refund",
    "verify_release",
    "verify_data_export",
    "verify_messaging",
    "verify_repository",
    
    # Backward compatibility
    "agent_passport_middleware",
    
    # SDK types
    "AportError",
    "PolicyVerificationResponse",
    "APortClient",
    "APortClientOptions",
    "PolicyVerifier",
    "Jwks",
    "Decision",
    "DecisionReason",
    "VerificationContext",
    "PolicyVerificationRequest",
    "PassportData",
    "AgentPassport",
]