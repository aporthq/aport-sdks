"""
MCP enforcement for Agent Passport SDK

Provides MCP (Model Context Protocol) enforcement capabilities for agent passports.
"""

from typing import Dict, Optional, Tuple, Any
from dataclasses import dataclass


@dataclass
class MCPHeaders:
    """MCP Headers extracted from HTTP request."""
    
    def __init__(
        self,
        server: Optional[str] = None,
        tool: Optional[str] = None,
        session: Optional[str] = None
    ):
        self.server = server
        self.tool = tool
        self.session = session
    
    def __bool__(self) -> bool:
        """Return True if any MCP headers are present."""
        return bool(self.server or self.tool)
    
    def to_dict(self) -> Dict[str, Optional[str]]:
        """Convert to dictionary for logging."""
        return {
            "server": self.server,
            "tool": self.tool,
            "session": self.session,
        }


@dataclass
class MCPEnforcementConfig:
    """MCP enforcement configuration."""
    
    def __init__(
        self,
        enabled: bool = True,
        strict_mode: bool = True,
        log_violations: bool = True
    ):
        self.enabled = enabled
        self.strict_mode = strict_mode
        self.log_violations = log_violations


def extract_mcp_headers_from_dict(headers: Dict[str, str]) -> MCPHeaders:
    """Extract MCP headers from a headers dictionary."""
    return MCPHeaders(
        server=headers.get('x-mcp-server'),
        tool=headers.get('x-mcp-tool'),
        session=headers.get('x-mcp-session'),
    )


def is_mcp_server_allowed(server: str, passport_data: Dict[str, Any]) -> bool:
    """Check if MCP server is allowlisted in passport."""
    mcp_data = passport_data.get('mcp')
    if not mcp_data:
        return False
    
    servers = mcp_data.get('servers', [])
    if not servers:
        return False
    
    return server in servers


def is_mcp_tool_allowed(tool: str, passport_data: Dict[str, Any]) -> bool:
    """Check if MCP tool is allowlisted in passport."""
    mcp_data = passport_data.get('mcp')
    if not mcp_data:
        return False
    
    tools = mcp_data.get('tools', [])
    if not tools:
        return False
    
    return tool in tools


def validate_mcp_headers(
    headers: MCPHeaders, 
    passport_data: Dict[str, Any]
) -> Tuple[bool, Optional[Dict[str, Any]]]:
    """
    Validate MCP headers against passport allowlists.
    
    Args:
        headers: MCP headers to validate
        passport_data: Agent passport data
        
    Returns:
        Tuple of (allowed: bool, error_response: Optional[Dict])
    """
    # If no MCP headers present, validation passes
    if not headers:
        return True, None

    # Check server allowlist
    if headers.server and not is_mcp_server_allowed(headers.server, passport_data):
        return False, {
            "error": "mcp_denied",
            "reason": "server_not_allowlisted",
            "server": headers.server,
        }

    # Check tool allowlist
    if headers.tool and not is_mcp_tool_allowed(headers.tool, passport_data):
        return False, {
            "error": "mcp_denied",
            "reason": "tool_not_allowlisted",
            "tool": headers.tool,
        }

    return True, None


def check_mcp_requirement(
    headers: Dict[str, str],
    passport_data: Dict[str, Any],
    config: Optional[MCPEnforcementConfig] = None
) -> Dict[str, Any]:
    """
    Check MCP requirements for a request.
    
    Args:
        headers: Request headers dictionary
        passport_data: Agent passport data
        config: MCP enforcement configuration
        
    Returns:
        Dictionary with check results and error details if applicable
    """
    if config is None:
        config = MCPEnforcementConfig()
    
    if not config.enabled:
        return {"allowed": True, "reason": None}
    
    try:
        # Extract MCP headers
        mcp_headers = extract_mcp_headers_from_dict(headers)
        
        # If no agent passport is available, skip MCP checks
        if not passport_data:
            if config.log_violations and mcp_headers:
                print(f"WARNING: MCP headers present but no agent passport available. "
                      f"Headers: {mcp_headers.to_dict()}")
            return {"allowed": True, "reason": None}
        
        # Validate MCP headers against passport allowlists
        allowed, error_response = validate_mcp_headers(mcp_headers, passport_data)
        
        if not allowed and error_response:
            if config.log_violations:
                allowlists = {}
                mcp_data = passport_data.get('mcp', {})
                if mcp_data:
                    allowlists = {
                        'servers': mcp_data.get('servers', []),
                        'tools': mcp_data.get('tools', []),
                    }
                
                print(f"WARNING: MCP allowlist violation. "
                      f"Agent: {passport_data.get('agent_id', 'unknown')}, "
                      f"Error: {error_response}, "
                      f"Headers: {mcp_headers.to_dict()}, "
                      f"Allowlists: {allowlists}")
            
            if config.strict_mode:
                return {
                    "allowed": False,
                    "reason": "mcp_denied",
                    "error": error_response
                }
        
        return {"allowed": True, "reason": None}
        
    except Exception as e:
        print(f"ERROR: MCP enforcement error: {e}")
        if config.strict_mode:
            return {
                "allowed": False,
                "reason": "mcp_enforcement_error",
                "error": "Failed to check MCP allowlists"
            }
        return {"allowed": True, "reason": None}


def policy_requires_mcp_enforcement(policy: Dict[str, Any]) -> bool:
    """Check if policy pack requires MCP allowlist enforcement."""
    return policy.get('mcp', {}).get('require_allowlisted_if_present', False)


def has_mcp_headers(headers: Dict[str, str]) -> bool:
    """Check if request has MCP headers."""
    mcp_headers = extract_mcp_headers_from_dict(headers)
    return bool(mcp_headers)


def get_mcp_headers(headers: Dict[str, str]) -> Optional[MCPHeaders]:
    """Get MCP headers from request headers."""
    mcp_headers = extract_mcp_headers_from_dict(headers)
    return mcp_headers if mcp_headers else None
