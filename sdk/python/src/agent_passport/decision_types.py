"""
Shared types for SDK-Server communication
These types are used by both the SDK and the API endpoints
"""

from typing import Any, Dict, List, Optional, Union
from dataclasses import dataclass


# Canonical request/response shapes for production-grade API
@dataclass
class PolicyVerificationRequest:
    """Canonical request shape for policy verification."""
    
    agent_id: str  # instance or template id
    idempotency_key: Optional[str] = None  # also sent as header; see below
    context: Dict[str, Any] = None  # policy-specific fields

    def __post_init__(self):
        if self.context is None:
            self.context = {}


@dataclass
class PolicyVerificationResponse:
    """Canonical response shape for policy verification."""
    
    decision_id: str
    allow: bool
    reasons: Optional[List[Dict[str, str]]] = None
    assurance_level: Optional[str] = None  # "L0" | "L1" | "L2" | "L3" | "L4"
    expires_in: Optional[int] = None  # for decision token mode
    passport_digest: Optional[str] = None
    signature: Optional[str] = None  # HMAC/JWT
    created_at: Optional[str] = None
    _meta: Optional[Dict[str, Any]] = None  # Server-Timing, etc.


# Legacy types for backward compatibility
@dataclass
class DecisionReason:
    """Reason for a policy decision."""
    
    code: str
    message: str
    severity: str  # "info" | "warning" | "error"


@dataclass
class Decision(PolicyVerificationResponse):
    """Policy decision result (legacy compatibility)."""
    pass


@dataclass
class VerificationContext:
    """Context for policy verification (legacy compatibility)."""
    
    agent_id: str
    policy_id: str
    context: Optional[Dict[str, Any]] = None
    idempotency_key: Optional[str] = None


# JWKS support for local token validation
@dataclass
class JwksKey:
    """JSON Web Key."""
    
    kty: str
    use: str
    kid: str
    x5t: str
    n: str
    e: str
    x5c: List[str]


@dataclass
class Jwks:
    """JSON Web Key Set."""
    
    keys: List[JwksKey]