"""Simplified FastAPI middleware for Agent Passport verification using SDK modules."""

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
)
from .types import AgentPassportMiddlewareOptions


class AgentPassportMiddleware(BaseHTTPMiddleware):
    """Simplified FastAPI middleware for Agent Passport verification using SDK modules."""

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
            
            # Verify agent passport using SDK
            agent = await self.client.verify_agent_passport(agent_id)
            
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


def has_agent(request: Request) -> bool:
    """
    Check if the request has an agent.

    Args:
        request: FastAPI request object

    Returns:
        True if request has agent
    """
    return hasattr(request.state, 'agent') and request.state.agent is not None
