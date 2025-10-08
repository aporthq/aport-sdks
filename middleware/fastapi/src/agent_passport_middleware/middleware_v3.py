"""
FastAPI middleware for Agent Passport Registry verification using SDK modules.

This middleware provides framework-specific integration for FastAPI
while delegating all business logic to the agent_passport SDK package.

Key Features:
- Agent ID validation with function parameter preference over headers
- Comprehensive policy enforcement with detailed error messages
- Type-safe interfaces for all middleware functions
- Flexible configuration options for different use cases
"""

import os
from typing import Callable, Optional, Dict, Any
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from agent_passport import (
    AgentPassportClient, 
    AgentPassport, 
    AgentPassportError,
    PolicyPack,
    PolicyResult,
    FieldValidationResult,
    EnforcementValidationResult,
    verify_agent_passport,
    verify_policy,
    has_policy_access,
    get_policy,
    get_policy_result,
    validate_policy_fields,
    validate_policy_enforcement,
)
from .types import AgentPassportMiddlewareOptions, PolicyResult as MiddlewarePolicyResult, PolicyEvaluation
from .validation import (
    validate_agent_id,
    validate_policy_id,
    validate_policy_call,
    validate_agent_id_present,
    extract_agent_id_from_request,
)


class AgentPassportMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware for Agent Passport verification using SDK modules."""
    
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
        self.client = AgentPassportClient(
            base_url=self.options.base_url or os.getenv("AGENT_PASSPORT_BASE_URL", "https://aport.io"),
            timeout=self.options.timeout,
            cache=self.options.cache
        )
    
    async def dispatch(self, request: Request, call_next: Callable):
        """
        Process the request through the middleware.
        
        Args:
            request: FastAPI request object
            call_next: Next middleware/handler in the chain
            
        Returns:
            Response from the next handler
        """
        try:
            # Skip verification for certain paths and methods
            if self._should_skip_verification(request):
                return await call_next(request)
            
            # Extract agent ID from headers
            agent_id = extract_agent_id_from_request(request)
            if not agent_id and self.options.fail_closed:
                return JSONResponse(
                    status_code=401,
                    content={
                        "error": "missing_agent_id",
                        "message": "Agent ID is required. Provide it as X-Agent-Passport-Id header."
                    }
                )
            
            if agent_id:
                # Verify agent passport using SDK function (matches Express middleware)
                try:
                    agent = await verify_agent_passport(agent_id, {})
                    request.state.agent = agent
                except AgentPassportError as e:
                    return JSONResponse(
                        status_code=401,
                        content={
                            "error": "agent_verification_failed",
                            "message": str(e),
                            "agent_id": agent_id
                        }
                    )
                
                # Run enforcement checks if policy is specified
                if self.options.policy_id:
                    await self._run_enforcement_checks(request, agent_id, self.options.policy_id)
            
            return await call_next(request)
            
        except Exception as e:
            return JSONResponse(
                status_code=500,
                content={
                    "error": "middleware_error",
                    "message": "Internal server error"
                }
            )
    
    def _should_skip_verification(self, request: Request) -> bool:
        """Check if verification should be skipped for this request."""
        # Skip based on path
        if request.url.path in self.options.skip_paths:
            return True
        
        # Skip based on method
        if request.method in self.options.skip_methods:
            return True
        
        return False
    
    async def _run_enforcement_checks(
        self, 
        request: Request, 
        agent_id: str, 
        policy_id: str
    ) -> None:
        """
        Run comprehensive enforcement checks for the agent and policy.
        
        Args:
            request: FastAPI request object
            agent_id: Agent ID to check
            policy_id: Policy ID to enforce
            
        Raises:
            HTTPException: If enforcement checks fail
        """
        try:
            # Get request body for policy evaluation
            body = {}
            if hasattr(request, '_json') and request._json:
                body = request._json
            elif hasattr(request, 'body'):
                try:
                    import json
                    body = json.loads(await request.body())
                except:
                    body = {}
            
            # Check if agent has access to the policy (matches Express middleware)
            has_access = await has_policy_access(agent_id, policy_id, body)
            if not has_access:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": "policy_access_denied",
                        "message": f"Agent does not have access to policy {policy_id}",
                        "agent_id": agent_id,
                        "policy_id": policy_id
                    }
                )
            
            # Get policy details (matches Express middleware)
            policy = await get_policy(policy_id)
            if not policy:
                raise HTTPException(
                    status_code=404,
                    detail={
                        "error": "policy_not_found",
                        "message": f"Policy {policy_id} not found",
                        "agent_id": agent_id,
                        "policy_id": policy_id
                    }
                )
            
            # Verify policy compliance using SDK (matches Express middleware)
            policy_result = await verify_policy(
                agent_id=agent_id,
                policy_id=policy_id,
                context=body,
                options={
                    "fail_closed": True,
                    "log_violations": True,
                    "cache_ttl": 60
                }
            )
            
            if not policy_result.get("allowed", False):
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": "policy_violation",
                        "message": policy_result.get("reason", "Policy violation"),
                        "agent_id": agent_id,
                        "policy_id": policy_id,
                        "violations": policy_result.get("violations", [])
                    }
                )
            
            # Extract policy result and attach to request (matches Express middleware)
            extracted_policy_result = get_policy_result(policy_result)
            request.state.policy_result = MiddlewarePolicyResult(
                allowed=True,
                evaluation=extracted_policy_result.__dict__ if extracted_policy_result else {},
                error=None
            )
            
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail={
                    "error": "enforcement_error",
                    "message": f"Failed to run enforcement checks: {str(e)}",
                    "agent_id": agent_id,
                    "policy_id": policy_id
                }
            )
    


def agent_passport_middleware(
    options: Optional[AgentPassportMiddlewareOptions] = None
) -> AgentPassportMiddleware:
    """
    Apply for Passport middleware with the specified options.
    
    Args:
        options: Middleware configuration options
        
    Returns:
        Configured middleware instance
    """
    def middleware_factory(app: ASGIApp) -> AgentPassportMiddleware:
        return AgentPassportMiddleware(app, options)
    
    return middleware_factory


def require_policy(
    policy_id: str, 
    agent_id: Optional[str] = None
) -> Callable:
    """
    Create middleware that enforces a specific policy.
    
    Args:
        policy_id: Policy ID to enforce
        agent_id: Explicit agent ID (preferred over header)
        
    Returns:
        Middleware function
    """
    async def policy_middleware(request: Request, call_next: Callable):
        try:
            # Validate policy call
            validated_agent_id, validated_policy_id = validate_policy_call(agent_id, policy_id)
            
            # Ensure agent ID is present
            final_agent_id = validate_agent_id_present(validated_agent_id, request)
            
            # Create client
            client = AgentPassportClient(
                base_url=os.getenv("AGENT_PASSPORT_BASE_URL", "https://aport.io"),
                timeout=5,
                cache=True
            )
            
            # Verify agent passport using SDK function (matches Express middleware)
            try:
                agent = await verify_agent_passport(final_agent_id, {})
                request.state.agent = agent
            except AgentPassportError as e:
                raise HTTPException(
                    status_code=401,
                    detail={
                        "error": "agent_verification_failed",
                        "message": str(e),
                        "agent_id": final_agent_id
                    }
                )
            
            # Get request body for policy evaluation
            body = {}
            if hasattr(request, '_json') and request._json:
                body = request._json
            elif hasattr(request, 'body'):
                try:
                    import json
                    body = json.loads(await request.body())
                except:
                    body = {}
            
            # Check if agent has access to the policy (matches Express middleware)
            has_access = await has_policy_access(final_agent_id, validated_policy_id, body)
            if not has_access:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": "policy_access_denied",
                        "message": f"Agent does not have access to policy {validated_policy_id}",
                        "agent_id": final_agent_id,
                        "policy_id": validated_policy_id
                    }
                )
            
            # Get policy details (matches Express middleware)
            policy = await get_policy(validated_policy_id)
            if not policy:
                raise HTTPException(
                    status_code=404,
                    detail={
                        "error": "policy_not_found",
                        "message": f"Policy {validated_policy_id} not found",
                        "agent_id": final_agent_id,
                        "policy_id": validated_policy_id
                    }
                )
            
            # Verify policy compliance using SDK (matches Express middleware)
            policy_result = await verify_policy(
                agent_id=final_agent_id,
                policy_id=validated_policy_id,
                context=body,
                options={
                    "fail_closed": True,
                    "log_violations": True,
                    "cache_ttl": 60
                }
            )
            
            if not policy_result.get("allowed", False):
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": "policy_violation",
                        "message": policy_result.get("reason", "Policy violation"),
                        "agent_id": final_agent_id,
                        "policy_id": validated_policy_id,
                        "violations": policy_result.get("violations", [])
                    }
                )
            
            # Extract policy result and attach to request (matches Express middleware)
            extracted_policy_result = get_policy_result(policy_result)
            request.state.policy_result = MiddlewarePolicyResult(
                allowed=True,
                evaluation=extracted_policy_result.__dict__ if extracted_policy_result else {},
                error=None
            )
            
            return await call_next(request)
            
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail={
                    "error": "policy_middleware_error",
                    "message": f"Policy middleware error: {str(e)}"
                }
            )
    
    return policy_middleware


def require_policy_with_context(
    policy_id: str,
    context: Dict[str, Any],
    agent_id: Optional[str] = None
) -> Callable:
    """
    Create middleware that enforces a specific policy with custom context.
    
    Args:
        policy_id: Policy ID to enforce
        context: Custom context data
        agent_id: Explicit agent ID (preferred over header)
        
    Returns:
        Middleware function
    """
    async def policy_middleware(request: Request, call_next: Callable):
        try:
            # Validate policy call
            validated_agent_id, validated_policy_id = validate_policy_call(agent_id, policy_id)
            
            # Ensure agent ID is present
            final_agent_id = validate_agent_id_present(validated_agent_id, request)
            
            # Create client
            client = AgentPassportClient(
                base_url=os.getenv("AGENT_PASSPORT_BASE_URL", "https://aport.io"),
                timeout=5,
                cache=True
            )
            
            # Verify agent passport
            try:
                agent = await client.verify_agent_passport(final_agent_id)
                request.state.agent = agent
            except AgentPassportError as e:
                raise HTTPException(
                    status_code=401,
                    detail={
                        "error": "agent_verification_failed",
                        "message": str(e),
                        "agent_id": final_agent_id
                    }
                )
            
            # Get request body and merge with context
            body = {}
            if hasattr(request, '_json') and request._json:
                body = request._json
            elif hasattr(request, 'body'):
                try:
                    import json
                    body = json.loads(await request.body())
                except:
                    body = {}
            
            # Merge context with request body
            merged_context = {**body, **context}
            
            # Check if agent has access to the policy (matches Express middleware)
            has_access = await has_policy_access(final_agent_id, validated_policy_id, merged_context)
            if not has_access:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": "policy_access_denied",
                        "message": f"Agent does not have access to policy {validated_policy_id}",
                        "agent_id": final_agent_id,
                        "policy_id": validated_policy_id
                    }
                )
            
            # Get policy details (matches Express middleware)
            policy = await get_policy(validated_policy_id)
            if not policy:
                raise HTTPException(
                    status_code=404,
                    detail={
                        "error": "policy_not_found",
                        "message": f"Policy {validated_policy_id} not found",
                        "agent_id": final_agent_id,
                        "policy_id": validated_policy_id
                    }
                )
            
            # Verify policy compliance using SDK (matches Express middleware)
            policy_result = await verify_policy(
                agent_id=final_agent_id,
                policy_id=validated_policy_id,
                context=merged_context,
                options={
                    "fail_closed": True,
                    "log_violations": True,
                    "cache_ttl": 60
                }
            )
            
            if not policy_result.get("allowed", False):
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": "policy_violation",
                        "message": policy_result.get("reason", "Policy violation"),
                        "agent_id": final_agent_id,
                        "policy_id": validated_policy_id,
                        "violations": policy_result.get("violations", [])
                    }
                )
            
            # Extract policy result and attach to request (matches Express middleware)
            extracted_policy_result = get_policy_result(policy_result)
            request.state.policy_result = MiddlewarePolicyResult(
                allowed=True,
                evaluation=extracted_policy_result.__dict__ if extracted_policy_result else {},
                error=None
            )
            
            return await call_next(request)
            
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail={
                    "error": "policy_middleware_error",
                    "message": f"Policy middleware error: {str(e)}"
                }
            )
    
    return policy_middleware


# Default options for the middleware
DEFAULT_OPTIONS = AgentPassportMiddlewareOptions(
    base_url=os.getenv("AGENT_PASSPORT_BASE_URL", "https://aport.io"),
    timeout=5,
    cache=True,
    fail_closed=True,
    allowed_regions=[],
    skip_paths=[],
    skip_methods=['OPTIONS'],
    policy_id=None
)
