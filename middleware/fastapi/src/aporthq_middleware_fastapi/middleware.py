"""FastAPI middleware for Agent Passport verification using the thin client SDK.

This middleware provides framework-specific integration for FastAPI
while delegating all business logic to the agent-passport SDK package.

Key Features:
- Agent ID validation with function parameter preference over headers
- Policy enforcement using the thin client SDK
- Type-safe interfaces for all middleware functions
- Simple configuration options
"""

import os
from typing import Callable, Optional, List, Dict, Any, Union
from fastapi import Request, HTTPException, Depends
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from aporthq_sdk_python import APortClient, APortClientOptions, PolicyVerifier, AportError


class AgentRequest(Request):
    """Extended FastAPI Request type to include agent and policy data."""
    agent: Optional[Dict[str, Any]] = None
    policy_result: Optional[Dict[str, Any]] = None


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


class PolicyMiddlewareOptions:
    """Options for policy-specific middleware."""
    
    def __init__(
        self,
        policy_id: str,
        agent_id: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
    ):
        self.policy_id = policy_id
        self.agent_id = agent_id
        self.context = context or {}


# Default middleware options
DEFAULT_OPTIONS = AgentPassportMiddlewareOptions()


def create_client(
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
    timeout_ms: Optional[int] = None,
) -> APortClient:
    """Create APortClient with sensible defaults."""
    options = APortClientOptions(
        base_url=base_url or os.getenv("AGENT_PASSPORT_BASE_URL", "https://api.aport.io"),
        api_key=api_key or os.getenv("AGENT_PASSPORT_API_KEY"),
        timeout_ms=timeout_ms or 5000,
    )
    return APortClient(options)


def extract_agent_id(
    request: Request,
    provided_agent_id: Optional[str] = None,
) -> Optional[str]:
    """Extract agent ID from request headers or function parameter."""
    if provided_agent_id:
        return provided_agent_id

    return (
        request.headers.get("x-agent-passport-id") or
        request.headers.get("x-agent-id") or
        None
    )


def should_skip_request(request: Request, skip_paths: List[str]) -> bool:
    """Check if request should be skipped based on path."""
    return any(request.url.path.startswith(path) for path in skip_paths)


def create_error_response(
    status_code: int,
    error: str,
    message: str,
    additional: Optional[Dict[str, Any]] = None,
) -> JSONResponse:
    """Create error response."""
    response_data = {
        "error": error,
        "message": message,
    }
    if additional:
        response_data.update(additional)
    
    return JSONResponse(
        status_code=status_code,
        content=response_data,
    )


class AgentPassportMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware for Agent Passport verification using the thin client SDK."""
    
    def __init__(
        self,
        app: ASGIApp,
        options: Optional[AgentPassportMiddlewareOptions] = None,
        **kwargs
    ):
        """
        Initialize the middleware.
        
        Args:
            app: FastAPI application
            options: Middleware configuration options
            **kwargs: Additional options passed from FastAPI add_middleware
        """
        super().__init__(app)
        
        # Handle options passed directly as kwargs (from FastAPI add_middleware)
        if options is None:
            options = AgentPassportMiddlewareOptions()
        
        # Override with any kwargs passed from FastAPI
        for key, value in kwargs.items():
            if hasattr(options, key):
                setattr(options, key, value)
        
        self.options = options
        self.client = create_client(
            base_url=self.options.base_url,
            api_key=self.options.api_key,
            timeout_ms=self.options.timeout_ms,
        )
        self.verifier = PolicyVerifier(self.client)

    async def dispatch(self, request: Request, call_next):
        """Process the request through the middleware."""
        try:
            # Skip middleware for certain paths
            if should_skip_request(request, self.options.skip_paths):
                return await call_next(request)

            # Extract agent ID
            agent_id = extract_agent_id(request)
            if not agent_id:
                if self.options.fail_closed:
                    return create_error_response(
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
                    return create_error_response(
                        error.status,
                        "agent_verification_failed",
                        error.message,
                        {"agent_id": agent_id}
                    )

            # Verify policy using the client directly
            context = getattr(request, "json", lambda: {})() if hasattr(request, "json") else {}
            decision = await self.client.verify_policy(
                agent_id,
                self.options.policy_id,
                context
            )

            if not decision.get("allow", False):
                return create_error_response(
                    403,
                    "policy_violation",
                    "Policy violation",
                    {
                        "agent_id": agent_id,
                        "policy_id": self.options.policy_id,
                        "decision_id": decision.get("decision_id"),
                        "reasons": decision.get("reasons", []),
                    }
                )

            # Add agent and policy data to request
            request.state.agent = {
                "agent_id": agent_id,
            }
            request.state.policy_result = decision

            return await call_next(request)

        except AportError as error:
            return create_error_response(
                error.status,
                "api_error",
                error.message,
                {"reasons": getattr(error, "reasons", [])}
            )

        except Exception as error:
            print(f"Agent Passport middleware error: {error}")
            return create_error_response(
                500,
                "internal_error",
                "Internal server error"
            )


def agent_passport_middleware(
    options: Optional[AgentPassportMiddlewareOptions] = None
) -> Callable:
    """
    Global middleware that enforces a specific policy on all routes.
    
    Args:
        options: Middleware configuration options
        
    Returns:
        Middleware function
    """
    opts = AgentPassportMiddlewareOptions(**(options.__dict__ if options else {}))
    client = create_client(
        base_url=opts.base_url,
        api_key=opts.api_key,
        timeout_ms=opts.timeout_ms,
    )
    verifier = PolicyVerifier(client)

    async def middleware(request: Request, call_next):
        try:
            # Skip middleware for certain paths
            if should_skip_request(request, opts.skip_paths):
                return await call_next(request)

            # Extract agent ID
            agent_id = extract_agent_id(request)
            if not agent_id:
                if opts.fail_closed:
                    return create_error_response(
                        401,
                        "missing_agent_id",
                        "Agent ID is required. Provide it as X-Agent-Passport-Id header."
                    )
                return await call_next(request)

            # If no policy ID specified, just verify agent exists
            if not opts.policy_id:
                try:
                    passport_view = await client.get_passport_view(agent_id)
                    request.state.agent = {
                        "agent_id": agent_id,
                        **passport_view,
                    }
                    return await call_next(request)
                except AportError as error:
                    return create_error_response(
                        error.status,
                        "agent_verification_failed",
                        error.message,
                        {"agent_id": agent_id}
                    )

            # Verify policy using the client directly
            context = getattr(request, "json", lambda: {})() if hasattr(request, "json") else {}
            decision = await client.verify_policy(
                agent_id,
                opts.policy_id,
                context
            )

            if not decision.get("allow", False):
                return create_error_response(
                    403,
                    "policy_violation",
                    "Policy violation",
                    {
                        "agent_id": agent_id,
                        "policy_id": opts.policy_id,
                        "decision_id": decision.get("decision_id"),
                        "reasons": decision.get("reasons", []),
                    }
                )

            # Add agent and policy data to request
            request.state.agent = {
                "agent_id": agent_id,
            }
            request.state.policy_result = decision

            return await call_next(request)

        except AportError as error:
            return create_error_response(
                error.status,
                "api_error",
                error.message,
                {"reasons": getattr(error, "reasons", [])}
            )

        except Exception as error:
            print(f"Policy verification error: {error}")
            return create_error_response(
                500,
                "internal_error",
                "Internal server error"
            )

    return middleware


def require_policy(policy_id: str, agent_id: Optional[str] = None) -> Callable:
    """
    Route-specific dependency that enforces a specific policy.
    
    Args:
        policy_id: The policy ID to verify
        agent_id: Optional agent ID (if not provided, extracted from headers)
        
    Returns:
        FastAPI dependency function
    """
    client = create_client()
    verifier = PolicyVerifier(client)

    async def policy_dependency(request: Request):
        try:
            # Extract agent ID
            extracted_agent_id = extract_agent_id(request, agent_id)
            if not extracted_agent_id:
                raise HTTPException(
                    status_code=401,
                    detail={
                        "error": "missing_agent_id",
                        "message": "Agent ID is required. Provide it as X-Agent-Passport-Id header or function parameter."
                    }
                )

            # Verify policy using the client directly
            context = getattr(request, "json", lambda: {})() if hasattr(request, "json") else {}
            decision = await client.verify_policy(
                extracted_agent_id,
                policy_id,
                context
            )

            if not decision.get("allow", False):
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": "policy_violation",
                        "message": "Policy violation",
                        "agent_id": extracted_agent_id,
                        "policy_id": policy_id,
                        "decision_id": decision.get("decision_id"),
                        "reasons": decision.get("reasons", []),
                    }
                )

            # Add agent and policy data to request
            request.state.agent = {
                "agent_id": extracted_agent_id,
            }
            request.state.policy_result = decision

            return {
                "agent": request.state.agent,
                "policy_result": request.state.policy_result
            }

        except HTTPException:
            # Re-raise HTTPException as-is
            raise
        except AportError as error:
            raise HTTPException(
                status_code=error.status,
                detail={
                    "error": "api_error",
                    "message": error.message,
                    "reasons": getattr(error, "reasons", [])
                }
            )
        except Exception as error:
            print(f"Policy verification error: {error}")
            raise HTTPException(
                status_code=500,
                detail={
                    "error": "internal_error",
                    "message": "Internal server error"
                }
            )

    return policy_dependency


def require_policy_with_context(
    policy_id: str,
    context: Dict[str, Any],
    agent_id: Optional[str] = None,
) -> Callable:
    """
    Route-specific middleware with custom context.
    
    Args:
        policy_id: The policy ID to verify
        context: Custom context to merge with request body
        agent_id: Optional agent ID (if not provided, extracted from headers)
        
    Returns:
        Middleware function
    """
    client = create_client()
    verifier = PolicyVerifier(client)

    async def middleware(request: Request, call_next):
        try:
            # Extract agent ID
            extracted_agent_id = extract_agent_id(request, agent_id)
            if not extracted_agent_id:
                return create_error_response(
                    401,
                    "missing_agent_id",
                    "Agent ID is required. Provide it as X-Agent-Passport-Id header or function parameter."
                )

            # Merge request body with custom context
            request_context = getattr(request, "json", lambda: {})() if hasattr(request, "json") else {}
            merged_context = {**request_context, **context}

            # Verify policy using the client directly
            decision = await client.verify_policy(
                extracted_agent_id,
                policy_id,
                merged_context
            )

            if not decision.get("allow", False):
                return create_error_response(
                    403,
                    "policy_violation",
                    "Policy violation",
                    {
                        "agent_id": extracted_agent_id,
                        "policy_id": policy_id,
                        "decision_id": decision.get("decision_id"),
                        "reasons": decision.get("reasons", []),
                    }
                )

            # Add agent and policy data to request
            request.state.agent = {
                "agent_id": extracted_agent_id,
            }
            request.state.policy_result = decision

            return await call_next(request)

        except AportError as error:
            return create_error_response(
                error.status,
                "api_error",
                error.message,
                {"reasons": getattr(error, "reasons", [])}
            )

        except Exception as error:
            print(f"Policy verification error: {error}")
            return create_error_response(
                500,
                "internal_error",
                "Internal server error"
            )

    return middleware


# Convenience functions for specific policies
def require_refund_policy(agent_id: Optional[str] = None) -> Callable:
    """Require refund policy."""
    return require_policy("finance.payment.refund.v1", agent_id)


def require_data_export_policy(agent_id: Optional[str] = None) -> Callable:
    """Require data export policy."""
    return require_policy("data.export.create.v1", agent_id)


def require_messaging_policy(agent_id: Optional[str] = None) -> Callable:
    """Require messaging policy."""
    return require_policy("messaging.message.send.v1", agent_id)


def require_repository_policy(agent_id: Optional[str] = None) -> Callable:
    """Require repository policy."""
    return require_policy("code.repository.merge.v1", agent_id)


# Direct SDK functions for convenience
def get_decision_token(
    agent_id: str,
    policy_id: str,
    context: Dict[str, Any] = None,
) -> str:
    """Get decision token for near-zero latency validation."""
    client = create_client()
    return client.get_decision_token(agent_id, policy_id, context or {})


def validate_decision_token(token: str) -> Dict[str, Any]:
    """Validate decision token via server."""
    client = create_client()
    return client.validate_decision_token(token)


def validate_decision_token_local(token: str) -> Dict[str, Any]:
    """Validate decision token locally using JWKS."""
    client = create_client()
    return client.validate_decision_token_local(token)


def get_passport_view(agent_id: str) -> Dict[str, Any]:
    """Get passport view for debugging/about pages."""
    client = create_client()
    return client.get_passport_view(agent_id)


def get_jwks() -> Dict[str, Any]:
    """Get JWKS for local token validation."""
    client = create_client()
    return client.get_jwks()


# Direct policy verification using PolicyVerifier
def verify_refund(
    agent_id: str,
    context: Dict[str, Any],
    idempotency_key: Optional[str] = None,
) -> Dict[str, Any]:
    """Verify refund policy."""
    client = create_client()
    verifier = PolicyVerifier(client)
    return verifier.verify_refund(agent_id, context, idempotency_key)


def verify_release(
    agent_id: str,
    context: Dict[str, Any],
    idempotency_key: Optional[str] = None,
) -> Dict[str, Any]:
    """Verify release policy."""
    client = create_client()
    verifier = PolicyVerifier(client)
    return verifier.verify_release(agent_id, context, idempotency_key)


def verify_data_export(
    agent_id: str,
    context: Dict[str, Any],
    idempotency_key: Optional[str] = None,
) -> Dict[str, Any]:
    """Verify data export policy."""
    client = create_client()
    verifier = PolicyVerifier(client)
    return verifier.verify_data_export(agent_id, context, idempotency_key)


def verify_messaging(
    agent_id: str,
    context: Dict[str, Any],
    idempotency_key: Optional[str] = None,
) -> Dict[str, Any]:
    """Verify messaging policy."""
    client = create_client()
    verifier = PolicyVerifier(client)
    return verifier.verify_messaging(agent_id, context, idempotency_key)


def verify_repository(
    agent_id: str,
    context: Dict[str, Any],
    idempotency_key: Optional[str] = None,
) -> Dict[str, Any]:
    """Verify repository policy."""
    client = create_client()
    verifier = PolicyVerifier(client)
    return verifier.verify_repository(agent_id, context, idempotency_key)