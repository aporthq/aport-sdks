"""FastAPI middleware for Agent Passport verification using SDK modules."""

import os
from typing import Callable, Optional, List
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from agent_passport import (
    AgentPassportClient, 
    AgentPassport, 
    AgentPassportError,
    check_assurance_requirement,
    check_capability_requirement,
    check_limits_for_operation,
    check_mcp_requirement,
    check_region_requirements,
    AssuranceEnforcementConfig,
    CapabilityEnforcementConfig,
    LimitsEnforcementConfig,
    MCPEnforcementConfig,
    RegionValidationConfig,
    MCPHeaders,
    extract_mcp_headers_from_dict,
)
from .types import AgentPassportMiddlewareOptions


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
            base_url=self.options.base_url,
            timeout=self.options.timeout,
            cache=self.options.cache
        )
        
        # Initialize enforcement configurations
        self.assurance_config = AssuranceEnforcementConfig()
        self.capability_config = getattr(self.options, 'capability_enforcement', CapabilityEnforcementConfig())
        self.limits_config = getattr(self.options, 'limits_enforcement', LimitsEnforcementConfig())
        self.mcp_config = MCPEnforcementConfig()
        self.region_config = RegionValidationConfig()
    
    def _extract_capability_ids(self, capabilities: List[any]) -> List[str]:
        """Extract capability IDs from a capabilities array consistently."""
        extracted = []
        for cap in capabilities:
            if isinstance(cap, str):
                extracted.append(cap)
            elif isinstance(cap, dict) and cap is not None:
                extracted.append(cap.get('id', cap))
            else:
                extracted.append(str(cap))
        return extracted
    
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
            # Skip middleware for certain paths and methods
            if self._should_skip_request(request):
                return await call_next(request)
            
            # Extract agent ID from X-Agent-Passport-Id header (preferred) or fallback to Authorization/X-Agent-ID
            auth_header = request.headers.get('authorization')
            agent_id = (
                request.headers.get('x-agent-passport-id') or
                request.headers.get('x-agent-id') or
                (auth_header[7:] if auth_header and auth_header.startswith('Bearer ') else None)
            )
            
            if not agent_id:
                if self.options.fail_closed:
                    return JSONResponse(
                        status_code=400,
                        content={
                            'error': 'missing_agent_id',
                            'message': 'X-Agent-Passport-Id header (preferred) or Authorization/X-Agent-ID header is required'
                        }
                    )
                return await call_next(request)
            
            # Verify agent passport
            agent = await self.client.verify_agent_passport(agent_id)
            
            # Check required permissions
            if self.options.required_permissions:
                has_all_permissions = all(
                    self.client.has_permission(agent, permission)
                    for permission in self.options.required_permissions
                )
                
                if not has_all_permissions:
                    return JSONResponse(
                        status_code=403,
                        content={
                            'error': 'insufficient_permissions',
                            'message': 'Agent does not have required permissions',
                            'required': self.options.required_permissions,
                            'current': agent.permissions
                        }
                    )
            
            # Check allowed regions
            if self.options.allowed_regions:
                is_allowed_in_any_region = any(
                    self.client.is_allowed_in_region(agent, region)
                    for region in self.options.allowed_regions
                )
                
                if not is_allowed_in_any_region:
                    return JSONResponse(
                        status_code=403,
                        content={
                            'error': 'region_not_allowed',
                            'message': 'Agent is not allowed in this region',
                            'allowed': self.options.allowed_regions,
                            'current': agent.regions
                        }
                    )
            
            # Check capability requirements using SDK
            agent_capabilities = self._extract_capability_ids(agent.capabilities)
            capability_check = check_capability_requirement(
                request.url.path, 
                agent_capabilities, 
                self.capability_config
            )
            
            if not capability_check["allowed"]:
                return JSONResponse(
                    status_code=403,
                    content={
                        'error': 'insufficient_capabilities',
                        'message': 'Agent does not have required capabilities for this route',
                        'required': capability_check.get("required", []),
                        'missing': capability_check.get("missing", []),
                        'current': agent_capabilities
                    }
                )

            # Check assurance requirements using SDK
            assurance_level = getattr(agent, 'assurance_level', 'L0')
            assurance_check = check_assurance_requirement(
                assurance_level,
                request.url.path,
                self.assurance_config
            )
            
            if not assurance_check["allowed"]:
                return JSONResponse(
                    status_code=403,
                    content={
                        'error': 'insufficient_assurance',
                        'message': f"This operation requires {assurance_check.get('required_level_name', 'higher')} assurance level",
                        'current_level': assurance_check.get('current_level'),
                        'current_level_name': assurance_check.get('current_level_name'),
                        'required_level': assurance_check.get('required_level'),
                        'required_level_name': assurance_check.get('required_level_name'),
                        'upgrade_instructions': assurance_check.get('upgrade_instructions'),
                        'docs_url': assurance_check.get('docs_url'),
                    }
                )

            # Check MCP requirements using SDK
            mcp_check = check_mcp_requirement(
                dict(request.headers),
                agent.__dict__,
                self.mcp_config
            )
            
            if not mcp_check["allowed"]:
                return JSONResponse(
                    status_code=403,
                    content=mcp_check.get("error", {
                        'error': 'mcp_denied',
                        'message': 'MCP access denied'
                    })
                )

            # Check region validation using SDK
            region_check = check_region_requirements(
                agent.regions,
                self.options.allowed_regions,
                self.region_config
            )
            
            if not region_check["allowed"]:
                return JSONResponse(
                    status_code=403,
                    content={
                        'error': region_check.get('reason', 'region_not_allowed'),
                        'message': region_check.get('error', 'Region validation failed'),
                        'allowed_regions': self.options.allowed_regions,
                        'agent_regions': agent.regions,
                    }
                )

            # Check limits using SDK
            limits_check = check_limits_for_operation(
                self._get_operation_type(request.url.path),
                agent.limits or {},
                self._extract_operation_data(request),
                self.limits_config
            )
            
            if not limits_check["allowed"]:
                return JSONResponse(
                    status_code=403,
                    content={
                        'error': 'limits_exceeded',
                        'message': 'Request exceeds agent limits',
                        'violations': limits_check.get('violations', []),
                        'limits': agent.limits
                    }
                )

            # Attach agent to request state
            request.state.agent = agent
            
            return await call_next(request)
            
        except AgentPassportError as e:
            return JSONResponse(
                status_code=e.status_code or 500,
                content={
                    'error': e.code,
                    'message': e.message,
                    'agent_id': e.agent_id
                }
            )
        except Exception as e:
            # Handle unexpected errors
            print(f'Agent Passport middleware error: {e}')
            return JSONResponse(
                status_code=500,
                content={
                    'error': 'internal_error',
                    'message': 'Internal server error'
                }
            )
    
    def _should_skip_request(self, request: Request) -> bool:
        """
        Check if request should be skipped.
        
        Args:
            request: FastAPI request object
            
        Returns:
            True if request should be skipped
        """
        # Skip certain HTTP methods
        if request.method in self.options.skip_methods:
            return True
        
        # Skip certain paths
        if any(request.url.path.startswith(path) for path in self.options.skip_paths):
            return True
        
        return False
    
    def _get_operation_type(self, path: str) -> str:
        """Extract operation type from request path"""
        if "/deploy" in path or "/infra" in path:
            return "deploy"
        elif "/export" in path or "/data" in path:
            return "export"
        elif "/refund" in path or "/payment" in path:
            return "refund"
        else:
            return "general"
    
    def _extract_operation_data(self, request: Request) -> dict:
        """Extract operation-specific data from request"""
        # This is a simplified implementation
        # In a real application, you might want to parse the request body
        return {}


def agent_passport_middleware(
    options: Optional[AgentPassportMiddlewareOptions] = None
) -> Callable[[ASGIApp], AgentPassportMiddleware]:
    """
    Create FastAPI middleware for agent passport verification using SDK modules.
    
    Args:
        options: Middleware configuration options
        
    Returns:
        Middleware factory function
    """
    def middleware_factory(app: ASGIApp) -> AgentPassportMiddleware:
        return AgentPassportMiddleware(app, options)
    
    return middleware_factory


def has_agent_permission(request: Request, permission: str) -> bool:
    """
    Check if the agent has a specific permission.
    
    Args:
        request: FastAPI request object
        permission: Permission to check
        
    Returns:
        True if agent has permission
    """
    if not hasattr(request.state, 'agent') or not request.state.agent:
        return False
    
    client = AgentPassportClient()
    return client.has_permission(request.state.agent, permission)


def is_agent_allowed_in_region(request: Request, region: str) -> bool:
    """
    Check if the agent is allowed in a specific region.
    
    Args:
        request: FastAPI request object
        region: Region to check
        
    Returns:
        True if agent is allowed in region
    """
    if not hasattr(request.state, 'agent') or not request.state.agent:
        return False
    
    client = AgentPassportClient()
    return client.is_allowed_in_region(request.state.agent, region)


def get_agent(request: Request) -> Optional[AgentPassport]:
    """
    Get the agent passport data from the request.
    
    Args:
        request: FastAPI request object
        
    Returns:
        Agent passport data or None
    """
    return getattr(request.state, 'agent', None)


def require_refunds_policy(
        agent_id: str,
        fail_closed: bool = True,
        log_violations: bool = True
    ):
        """
        FastAPI dependency for finance.payment.refund.v1 policy enforcement.
        Uses the SDK's refunds helper for proper separation of concerns.

        Args:
            agent_id: Agent ID to check
            fail_closed: Whether to fail closed on policy violations
            log_violations: Whether to log policy violations

        Returns:
            FastAPI dependency function
        """
        async def refunds_policy_dependency(request: Request):
            try:
                from agent_passport import process_refund, create_refund_context, RefundPolicyConfig

                # Extract request data
                body = await request.json() if request.method in ["POST", "PUT", "PATCH"] else {}
                headers = dict(request.headers)

                # Create refund context using SDK helper
                refund_context = create_refund_context(body, headers)

                # Process refund using SDK helper
                result = await process_refund(refund_context, RefundPolicyConfig(
                    agent_id=agent_id,
                    fail_closed=fail_closed,
                    log_violations=log_violations
                ))

                if not result.allowed:
                    if log_violations:
                        logger.warning(f"Refunds policy violation for agent {agent_id}: {result.error}")

                    error_response = {
                        "success": False,
                        "error": result.error.get("code", "refund_policy_violation") if result.error else "refund_policy_violation",
                        "message": result.error.get("message", "Refund request violates policy") if result.error else "Refund request violates policy",
                        "reasons": result.error.get("reasons", []) if result.error else [],
                    }

                    # Add finance.payment.refund.v1 specific fields
                    if result.decision_id:
                        error_response["decision_id"] = result.decision_id
                    if result.remaining_daily_cap:
                        error_response["remaining_daily_cap"] = result.remaining_daily_cap
                    if result.expires_in:
                        error_response["expires_in"] = result.expires_in

                    raise HTTPException(
                        status_code=403,
                        detail=error_response
                    )

                # Store policy result in request state for use in route handler
                request.state.policy_result = {
                    "evaluation": {
                        "decision_id": result.decision_id,
                        "remaining_daily_cap": result.remaining_daily_cap,
                        "expires_in": result.expires_in,
                    },
                    "refund_id": result.refund_id,
                }

                return request.state.policy_result

            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"Refunds policy enforcement error: {e}")

                if fail_closed:
                    raise HTTPException(
                        status_code=500,
                        detail={
                            "success": False,
                            "error": "refund_policy_error",
                            "message": "Failed to verify refund policy compliance"
                        }
                    )

                return None

        return refunds_policy_dependency


def has_agent(request: Request) -> bool:
    """
    Check if the request has an agent.
    
    Args:
        request: FastAPI request object
        
    Returns:
        True if request has agent
    """
    return hasattr(request.state, 'agent') and request.state.agent is not None
