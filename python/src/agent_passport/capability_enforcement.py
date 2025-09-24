"""
Capability Enforcement for Agent Passport SDK

This module defines the mapping between API routes and required capabilities
for capability-based authorization.
"""

from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass

# Route pattern to capability mapping
# Each route pattern maps to one or more required capabilities.
# The middleware will check if the agent has ALL required capabilities.
ROUTE_CAPABILITY_MAP: Dict[str, List[str]] = {
    # Payment routes
    "/api/payments/refund": ["payments.refund"],
    "/api/payments/refund/*": ["payments.refund"],
    "/api/payments/payout": ["payments.payout"],
    "/api/payments/payout/*": ["payments.payout"],
    "/api/payments/*": ["payments.refund", "payments.payout"],

    # Returns routes
    "/api/returns": ["returns.process"],
    "/api/returns/*": ["returns.process"],
    "/api/returns/process": ["returns.process"],
    "/api/returns/approve": ["returns.process"],

    # Inventory routes
    "/api/inventory": ["inventory.adjust"],
    "/api/inventory/*": ["inventory.adjust"],
    "/api/inventory/adjust": ["inventory.adjust"],
    "/api/inventory/stock": ["inventory.adjust"],

    # Data export routes
    "/api/data/export": ["data.export"],
    "/api/data/export/*": ["data.export"],
    "/api/exports": ["data.export"],
    "/api/exports/*": ["data.export"],
    "/api/reports": ["data.export"],
    "/api/reports/*": ["data.export"],

    # Data deletion routes
    "/api/data/delete": ["data.delete"],
    "/api/data/delete/*": ["data.delete"],
    "/api/data/purge": ["data.delete"],
    "/api/data/purge/*": ["data.delete"],

    # Identity and role management
    "/api/identity/roles": ["identity.manage_roles"],
    "/api/identity/roles/*": ["identity.manage_roles"],
    "/api/users/roles": ["identity.manage_roles"],
    "/api/users/roles/*": ["identity.manage_roles"],
    "/api/permissions": ["identity.manage_roles"],
    "/api/permissions/*": ["identity.manage_roles"],

    # Messaging routes
    "/api/messages": ["messaging.send"],
    "/api/messages/*": ["messaging.send"],
    "/api/notifications": ["messaging.send"],
    "/api/notifications/*": ["messaging.send"],
    "/api/email": ["messaging.send"],
    "/api/email/*": ["messaging.send"],
    "/api/slack": ["messaging.send"],
    "/api/slack/*": ["messaging.send"],
    "/api/discord": ["messaging.send"],
    "/api/discord/*": ["messaging.send"],
    "/api/messaging": ["messaging.send"],
    "/api/messaging/*": ["messaging.send"],

    # CRM routes
    "/api/crm": ["crm.update"],
    "/api/crm/*": ["crm.update"],
    "/api/customers": ["crm.update"],
    "/api/customers/*": ["crm.update"],
    "/api/contacts": ["crm.update"],
    "/api/contacts/*": ["crm.update"],

    # Repository routes - PR creation
    "/api/repo/pr": ["repo.pr.create"],
    "/api/repo/pr/*": ["repo.pr.create"],
    "/api/repo/pull-request": ["repo.pr.create"],
    "/api/repo/pull-request/*": ["repo.pr.create"],
    "/api/pull-requests/create": ["repo.pr.create"],
    "/api/github/pr": ["repo.pr.create"],
    "/api/github/pr/*": ["repo.pr.create"],
    "/api/gitlab/mr": ["repo.pr.create"],
    "/api/gitlab/mr/*": ["repo.pr.create"],

    # Repository routes - Merging
    "/api/repo/merge": ["repo.merge"],
    "/api/repo/merge/*": ["repo.merge"],
    "/api/git/merge": ["repo.merge"],
    "/api/git/merge/*": ["repo.merge"],
    "/api/pull-requests/merge": ["repo.merge"],
    "/api/pull-requests/*/merge": ["repo.merge"],
    "/api/github/merge": ["repo.merge"],
    "/api/gitlab/merge": ["repo.merge"],

    # Infrastructure deployment routes
    "/api/deploy": ["infra.deploy"],
    "/api/deploy/*": ["infra.deploy"],
    "/api/infrastructure": ["infra.deploy"],
    "/api/infrastructure/*": ["infra.deploy"],
    "/api/environments": ["infra.deploy"],
    "/api/environments/*": ["infra.deploy"],
}


def get_required_capabilities(route: str) -> List[str]:
    """
    Get required capabilities for a given route.
    
    Args:
        route: The route path to check
        
    Returns:
        List of required capability IDs, or empty list if no mapping found
    """
    # First try exact match
    if route in ROUTE_CAPABILITY_MAP:
        return ROUTE_CAPABILITY_MAP[route]
    
    # Then try pattern matching for wildcard routes
    for pattern, capabilities in ROUTE_CAPABILITY_MAP.items():
        if '*' in pattern:
            import re
            regex_pattern = pattern.replace('*', '.*')
            if re.match(f'^{regex_pattern}$', route):
                return capabilities
    
    return []


def requires_capabilities(route: str) -> bool:
    """
    Check if a route requires capabilities.
    
    Args:
        route: The route path to check
        
    Returns:
        True if the route has capability requirements
    """
    return len(get_required_capabilities(route)) > 0


def get_routes_for_capability(capability_id: str) -> List[str]:
    """
    Get all routes that require a specific capability.
    
    Args:
        capability_id: The capability ID to search for
        
    Returns:
        List of route patterns that require this capability
    """
    return [
        route for route, capabilities in ROUTE_CAPABILITY_MAP.items()
        if capability_id in capabilities
    ]


@dataclass
class CapabilityEnforcementConfig:
    """Configuration for capability enforcement."""
    
    def __init__(
        self,
        enforce_on_all_routes: bool = True,
        skip_routes: Optional[List[str]] = None,
        allow_unmapped_routes: bool = False,
        custom_mappings: Optional[Dict[str, List[str]]] = None
    ):
        self.enforce_on_all_routes = enforce_on_all_routes
        self.skip_routes = skip_routes or []
        self.allow_unmapped_routes = allow_unmapped_routes
        self.custom_mappings = custom_mappings or {}


def create_capability_enforcer(config: CapabilityEnforcementConfig):
    """
    Create a capability enforcer with custom configuration.
    
    Args:
        config: Configuration options
        
    Returns:
        Capability enforcer function
    """
    # Merge custom mappings with defaults
    all_mappings = {**ROUTE_CAPABILITY_MAP, **config.custom_mappings}
    
    def enforce_capabilities(route: str, agent_capabilities: List[str]) -> Tuple[bool, List[str], List[str]]:
        """
        Enforce capability requirements for a route.
        
        Args:
            route: The route path
            agent_capabilities: List of agent's capabilities
            
        Returns:
            Tuple of (allowed, required, missing)
        """
        # Check if route should be skipped
        if any(route.startswith(skip_route) for skip_route in config.skip_routes):
            return True, [], []
        
        # Get required capabilities for this route
        required = all_mappings.get(route, [])
        
        # If no mapping exists and we don't allow unmapped routes
        if not required and not config.allow_unmapped_routes and config.enforce_on_all_routes:
            return False, [], []
        
        # If no capabilities required, allow access
        if not required:
            return True, [], []
        
        # Check if agent has all required capabilities
        missing = [cap for cap in required if cap not in agent_capabilities]
        allowed = len(missing) == 0
        
        return allowed, required, missing
    
    return enforce_capabilities


def check_capability_requirement(
    route: str,
    agent_capabilities: List[str],
    config: CapabilityEnforcementConfig
) -> Dict[str, Any]:
    """
    Check if agent has required capabilities for a route.
    
    Args:
        route: The route path to check
        agent_capabilities: List of agent's capabilities
        config: Capability enforcement configuration
        
    Returns:
        Dictionary with check results and error details if applicable
    """
    enforcer = create_capability_enforcer(config)
    allowed, required, missing = enforcer(route, agent_capabilities)
    
    if not allowed:
        return {
            "allowed": False,
            "reason": "insufficient_capabilities",
            "required": required,
            "missing": missing,
            "current": agent_capabilities,
            "route": route
        }
    
    return {"allowed": True, "reason": None}
