"""FastAPI middleware for Agent Passport verification using the thin client SDK."""

import os
from typing import Callable, Optional, List, Dict, Any
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from agent_passport import APortClient, APortClientOptions, PolicyVerifier, AportError


class AgentPassportMiddlewareOptions:
    """Configuration options for the Agent Passport middleware."""
    
    def __init__(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        timeout_ms: int = 5000,
        fail_closed: bool = True,
        skip_paths: Optional[List[str]] = None,
        policy_id: Optional[str] = None,
    ):
        self.base_url = base_url or os.getenv("AGENT_PASSPORT_BASE_URL", "https://api.aport.io")
        self.api_key = api_key or os.getenv("AGENT_PASSPORT_API_KEY")
        self.timeout_ms = timeout_ms
        self.fail_closed = fail_closed
        self.skip_paths = skip_paths or ["/health", "/metrics", "/status"]
        self.policy_id = policy_id


class AgentPassportMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware for Agent Passport verification using the thin client SDK."""
    
    def __init__(
        self,
        app: ASGIApp,
        options: Optional[AgentPassportMiddlewareOptions] = None
    ):
        """
        Initialize the middleware.
        
        Args:
            app: FastAPI application
            options: Middleware configuration options
        """
        super().__init__(app)
        self.options = options or AgentPassportMiddlewareOptions()
        
        # Initialize the thin client
        client_options = APortClientOptions(
            base_url=self.options.base_url,
            api_key=self.options.api_key,
            timeout_ms=self.options.timeout_ms,
        )
        self.client = APortClient(client_options)
        self.verifier = PolicyVerifier(self.client)
    
    def _extract_agent_id(self, request: Request, provided_agent_id: Optional[str] = None) -> Optional[str]:
        """Extract agent ID from request headers or function parameter."""
        if provided_agent_id:
            return provided_agent_id
        
        return (
            request.headers.get("x-agent-passport-id") or
            request.headers.get("x-agent-id") or
            None
        )
    
    def _should_skip_request(self, request: Request) -> bool:
        """Check if request should be skipped based on path."""
        return any(request.url.path.startswith(path) for path in self.options.skip_paths)
    
    def _create_error_response(
        self, 
        status_code: int, 
        error: str, 
        message: str, 
        additional: Optional[Dict[str, Any]] = None
    ) -> JSONResponse:
        """Create standardized error response."""
        content = {
            "error": error,
            "message": message,
        }
        if additional:
            content.update(additional)
        return JSONResponse(status_code=status_code, content=content)
    
    async def dispatch(self, request: Request, call_next: Callable) -> JSONResponse:
        """
        Process the request and verify agent passport.
        
        Args:
            request: FastAPI request object
            call_next: Next middleware/handler in the chain
            
        Returns:
            Response from the next handler or error response
        """
        try:
            # Skip middleware for certain paths
            if self._should_skip_request(request):
                return await call_next(request)
            
            # Extract agent ID
            agent_id = self._extract_agent_id(request)
            if not agent_id:
                if self.options.fail_closed:
                    return self._create_error_response(
                        401,
                        "missing_agent_id",
                        "Agent ID is required. Provide it as X-Agent-Passport-Id header."
                    )
                return await call_next(request)
            
            # If no policy ID specified, just verify agent exists
            if not self.options.policy_id:
                try:
                    passport_view = await self.client.get_passport_view(agent_id)
                    request.state.agent = {
                        "agent_id": agent_id,
                        **passport_view,
                    }
                    return await call_next(request)
                except AportError as error:
                    return self._create_error_response(
                        error.status,
                        "agent_verification_failed",
                        str(error),
                        {"agent_id": agent_id}
                    )
            
            # Verify policy
            context = {}
            try:
                body = await request.json()
                context = body
            except Exception:
                # If JSON parsing fails, use empty context
                pass
            
            decision = await self.verifier.verify_policy(
                self.options.policy_id, 
                agent_id, 
                context
            )
            
            if not decision.allow:
                return self._create_error_response(
                    403,
                    "policy_violation",
                    "Policy violation",
                    {
                        "agent_id": agent_id,
                        "policy_id": self.options.policy_id,
                        "decision_id": decision.decision_id,
                        "reasons": decision.reasons,
                    }
                )
            
            # Add agent and policy data to request state
            request.state.agent = {
                "agent_id": agent_id,
            }
            request.state.policy_result = decision
            
            return await call_next(request)
            
        except AportError as error:
            return self._create_error_response(
                error.status,
                "api_error",
                str(error),
                {"reasons": error.reasons}
            )
        except Exception as error:
            print(f"Agent Passport middleware error: {error}")
            return self._create_error_response(
                500,
                "internal_error",
                "Internal server error"
            )


def require_policy(policy_id: str, agent_id: Optional[str] = None):
    """
    Route-specific middleware that enforces a specific policy.
    
    Args:
        policy_id: Policy ID to enforce (e.g., "payments.refund.v1")
        agent_id: Explicit agent ID (preferred over header)
    
    Returns:
        Middleware function
    """
    client_options = APortClientOptions(
        base_url=os.getenv("AGENT_PASSPORT_BASE_URL", "https://api.aport.io"),
        api_key=os.getenv("AGENT_PASSPORT_API_KEY"),
        timeout_ms=5000,
    )
    client = APortClient(client_options)
    verifier = PolicyVerifier(client)
    
    async def middleware(request: Request, call_next: Callable) -> JSONResponse:
        try:
            # Extract agent ID
            extracted_agent_id = (
                agent_id or
                request.headers.get("x-agent-passport-id") or
                request.headers.get("x-agent-id")
            )
            
            if not extracted_agent_id:
                return JSONResponse(
                    status_code=401,
                    content={
                        "error": "missing_agent_id",
                        "message": "Agent ID is required. Provide it as X-Agent-Passport-Id header or function parameter."
                    }
                )
            
            # Verify policy
            context = {}
            try:
                body = await request.json()
                context = body
            except Exception:
                # If JSON parsing fails, use empty context
                pass
            
            decision = await verifier.verify_policy(policy_id, extracted_agent_id, context)
            
            if not decision.allow:
                return JSONResponse(
                    status_code=403,
                    content={
                        "error": "policy_violation",
                        "message": "Policy violation",
                        "agent_id": extracted_agent_id,
                        "policy_id": policy_id,
                        "decision_id": decision.decision_id,
                        "reasons": decision.reasons,
                    }
                )
            
            # Add agent and policy data to request state
            request.state.agent = {
                "agent_id": extracted_agent_id,
            }
            request.state.policy_result = decision
            
            return await call_next(request)
            
        except AportError as error:
            return JSONResponse(
                status_code=error.status,
                content={
                    "error": "api_error",
                    "message": str(error),
                    "reasons": error.reasons,
                }
            )
        except Exception as error:
            print(f"Policy verification error: {error}")
            return JSONResponse(
                status_code=500,
                content={
                    "error": "internal_error",
                    "message": "Internal server error"
                }
            )
    
    return middleware


def require_policy_with_context(
    policy_id: str, 
    context: Dict[str, Any], 
    agent_id: Optional[str] = None
):
    """
    Route-specific middleware with custom context.
    
    Args:
        policy_id: Policy ID to enforce
        context: Custom context data
        agent_id: Explicit agent ID (preferred over header)
    
    Returns:
        Middleware function
    """
    client_options = APortClientOptions(
        base_url=os.getenv("AGENT_PASSPORT_BASE_URL", "https://api.aport.io"),
        api_key=os.getenv("AGENT_PASSPORT_API_KEY"),
        timeout_ms=5000,
    )
    client = APortClient(client_options)
    verifier = PolicyVerifier(client)
    
    async def middleware(request: Request, call_next: Callable) -> JSONResponse:
        try:
            # Extract agent ID
            extracted_agent_id = (
                agent_id or
                request.headers.get("x-agent-passport-id") or
                request.headers.get("x-agent-id")
            )
            
            if not extracted_agent_id:
                return JSONResponse(
                    status_code=401,
                    content={
                        "error": "missing_agent_id",
                        "message": "Agent ID is required. Provide it as X-Agent-Passport-Id header or function parameter."
                    }
                )
            
            # Merge request body with custom context
            merged_context = context.copy()
            try:
                body = await request.json()
                merged_context.update(body)
            except Exception:
                # If JSON parsing fails, use custom context only
                pass
            
            decision = await verifier.verify_policy(policy_id, extracted_agent_id, merged_context)
            
            if not decision.allow:
                return JSONResponse(
                    status_code=403,
                    content={
                        "error": "policy_violation",
                        "message": "Policy violation",
                        "agent_id": extracted_agent_id,
                        "policy_id": policy_id,
                        "decision_id": decision.decision_id,
                        "reasons": decision.reasons,
                    }
                )
            
            # Add agent and policy data to request state
            request.state.agent = {
                "agent_id": extracted_agent_id,
            }
            request.state.policy_result = decision
            
            return await call_next(request)
            
        except AportError as error:
            return JSONResponse(
                status_code=error.status,
                content={
                    "error": "api_error",
                    "message": str(error),
                    "reasons": error.reasons,
                }
            )
        except Exception as error:
            print(f"Policy verification error: {error}")
            return JSONResponse(
                status_code=500,
                content={
                    "error": "internal_error",
                    "message": "Internal server error"
                }
            )
    
    return middleware


# Convenience functions for specific policies
def require_refund_policy(agent_id: Optional[str] = None):
    """Require payments.refund.v1 policy."""
    return require_policy("payments.refund.v1", agent_id)


def require_data_export_policy(agent_id: Optional[str] = None):
    """Require data.export.v1 policy."""
    return require_policy("data.export.v1", agent_id)


def require_messaging_policy(agent_id: Optional[str] = None):
    """Require messaging.v1 policy."""
    return require_policy("messaging.v1", agent_id)


def require_repository_policy(agent_id: Optional[str] = None):
    """Require repo.v1 policy."""
    return require_policy("repo.v1", agent_id)


def _create_client() -> APortClient:
    """Create APortClient with sensible defaults."""
    return APortClient(APortClientOptions(
        base_url=os.getenv("AGENT_PASSPORT_BASE_URL"),
        api_key=os.getenv("AGENT_PASSPORT_API_KEY"),
        timeout_ms=5000,
    ))


# Direct SDK functions for programmatic use
def get_decision_token(
    agent_id: str, 
    policy_id: str, 
    context: Dict[str, Any] = None
) -> str:
    """Get decision token for near-zero latency validation."""
    client = _create_client()
    return client.get_decision_token(agent_id, policy_id, context or {})


def validate_decision_token(token: str):
    """Validate decision token via server."""
    client = _create_client()
    return client.validate_decision_token(token)


def validate_decision_token_local(token: str):
    """Validate decision token locally using JWKS."""
    client = _create_client()
    return client.validate_decision_token_local(token)


def get_passport_view(agent_id: str) -> Dict[str, Any]:
    """Get passport view for debugging/about pages."""
    client = _create_client()
    return client.get_passport_view(agent_id)


def get_jwks():
    """Get JWKS for local token validation."""
    client = _create_client()
    return client.get_jwks()


# Direct policy verification functions
def verify_refund(
    agent_id: str,
    context: Dict[str, Any],
    idempotency_key: Optional[str] = None
):
    """Verify payments.refund.v1 policy directly."""
    client = _create_client()
    verifier = PolicyVerifier(client)
    return verifier.verify_refund(agent_id, context, idempotency_key)


def verify_release(
    agent_id: str,
    context: Dict[str, Any],
    idempotency_key: Optional[str] = None
):
    """Verify release.v1 policy directly."""
    client = _create_client()
    verifier = PolicyVerifier(client)
    return verifier.verify_release(agent_id, context, idempotency_key)


def verify_data_export(
    agent_id: str,
    context: Dict[str, Any],
    idempotency_key: Optional[str] = None
):
    """Verify data.export.v1 policy directly."""
    client = _create_client()
    verifier = PolicyVerifier(client)
    return verifier.verify_data_export(agent_id, context, idempotency_key)


def verify_messaging(
    agent_id: str,
    context: Dict[str, Any],
    idempotency_key: Optional[str] = None
):
    """Verify messaging.v1 policy directly."""
    client = _create_client()
    verifier = PolicyVerifier(client)
    return verifier.verify_messaging(agent_id, context, idempotency_key)


def verify_repository(
    agent_id: str,
    context: Dict[str, Any],
    idempotency_key: Optional[str] = None
):
    """Verify repo.v1 policy directly."""
    client = _create_client()
    verifier = PolicyVerifier(client)
    return verifier.verify_repository(agent_id, context, idempotency_key)


# Alias for backward compatibility
agent_passport_middleware = AgentPassportMiddleware