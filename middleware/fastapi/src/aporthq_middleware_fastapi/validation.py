"""
Validation utilities for FastAPI Agent Passport middleware.

This module provides validation functions for agent IDs, policy IDs, and policy calls,
following the same approach as the Express middleware.
"""

from typing import Optional, Dict, Any
from fastapi import Request, HTTPException
from aporthq_sdk_python import AportError


def validate_agent_id(agent_id: str) -> str:
    """
    Validate that an agent ID is present and non-empty.
    
    Args:
        agent_id: Agent ID to validate
        
    Returns:
        Validated agent ID
        
    Raises:
        AportError: If agent ID is invalid
    """
    if not agent_id or not agent_id.strip():
        raise AportError(
            "Agent ID is required",
            "missing_agent_id",
            401
        )
    
    return agent_id.strip()


def validate_policy_id(policy_id: str) -> str:
    """
    Validate that a policy ID is present and non-empty.
    
    Args:
        policy_id: Policy ID to validate
        
    Returns:
        Validated policy ID
        
    Raises:
        AportError: If policy ID is invalid
    """
    if not policy_id or not policy_id.strip():
        raise AportError(
            "Policy ID is required",
            "missing_policy_id",
            400
        )
    
    return policy_id.strip()


def extract_agent_id_from_request(request: Request) -> Optional[str]:
    """
    Extract agent ID from request headers.
    
    Args:
        request: FastAPI request object
        
    Returns:
        Agent ID from X-Agent-Passport-Id header, or None if not present
    """
    return request.headers.get("X-Agent-Passport-Id")


def validate_policy_call(agent_id: Optional[str], policy_id: str) -> tuple[str, str]:
    """
    Validate both agent ID and policy ID for a policy call.
    
    Args:
        agent_id: Agent ID (can be None to use header fallback)
        policy_id: Policy ID to validate
        
    Returns:
        Tuple of (validated_agent_id, validated_policy_id)
        
    Raises:
        AgentPassportError: If validation fails
    """
    validated_policy_id = validate_policy_id(policy_id)
    
    if agent_id:
        # Use explicit agent ID
        validated_agent_id = validate_agent_id(agent_id)
    else:
        # Agent ID will be extracted from headers in the middleware
        validated_agent_id = None
    
    return validated_agent_id, validated_policy_id


def validate_agent_id_present(agent_id: Optional[str], request: Request) -> str:
    """
    Ensure agent ID is present, either from parameter or header.
    
    Args:
        agent_id: Agent ID from function parameter (can be None)
        request: FastAPI request object
        
    Returns:
        Validated agent ID
        
    Raises:
        AgentPassportError: If no agent ID is available
    """
    if agent_id:
        return validate_agent_id(agent_id)
    
    # Try to extract from header
    header_agent_id = extract_agent_id_from_request(request)
    if header_agent_id:
        return validate_agent_id(header_agent_id)
    
    # No agent ID available
    raise AportError(
        "Agent ID is required. Provide it as X-Agent-Passport-Id header or function parameter.",
        "missing_agent_id",
        401
    )
