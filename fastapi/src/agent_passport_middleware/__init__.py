"""
FastAPI middleware for Agent Passport Registry.

Provides middleware for FastAPI applications to verify agent passports
and enforce permissions and regional access controls.

This package uses the Agent Passport SDK for core functionality,
making it framework-agnostic while providing FastAPI-specific middleware.
"""

# Import from SDK for core functionality
from agent_passport import (
    # Core SDK
    AgentPassportClient,
    AgentPassportError,
    AgentPassport,
    VerificationOptions,
    
    # Enforcement modules
    AssuranceLevel,
    AssuranceEnforcementConfig,
    AssuranceLevelMetadata,
    meets_minimum_assurance,
    get_required_assurance_level,
    get_operation_from_path,
    get_upgrade_instructions,
    check_assurance_requirement,
    require_email_verified,
    require_github_verified,
    require_domain_verified,
    require_kyc_verified,
    require_financial_verified,
    ASSURANCE_LEVEL_METADATA,
    
    CapabilityEnforcementConfig,
    create_capability_enforcer,
    check_capability_requirement,
    
    LimitsEnforcementConfig,
    LimitChecker,
    create_limit_checker,
    check_limits_for_operation,
    
    MCPHeaders,
    MCPEnforcementConfig,
    extract_mcp_headers_from_dict,
    is_mcp_server_allowed,
    is_mcp_tool_allowed,
    validate_mcp_headers,
    check_mcp_requirement,
    policy_requires_mcp_enforcement,
    has_mcp_headers,
    get_mcp_headers,
    
    PolicyPack,
    PassportData,
    PolicyResult,
    PolicyEnforcementConfig,
    check_policy_compliance,
    check_policy_sync,
    
    RegionValidationConfig,
    validate_region,
    validate_regions,
    is_valid_region,
    is_agent_authorized_in_region,
    check_region_requirements,
    require_us_regions,
    require_eu_regions,
    require_north_america_regions,
    
    # Taxonomy validation
    TaxonomyValidationConfig,
    validate_categories,
    validate_frameworks,
    validate_agent_taxonomy,
    check_taxonomy_requirements,
    get_agent_categories,
    get_agent_frameworks,
    has_required_categories,
    has_required_frameworks,
)

# Import FastAPI-specific middleware
from .middleware import (
    AgentPassportMiddleware,
    agent_passport_middleware,
    has_agent_permission,
    is_agent_allowed_in_region,
    get_agent,
    has_agent,
)
from .types import AgentPassportMiddlewareOptions

__version__ = "0.2.0"
__all__ = [
    # Core SDK (re-exported)
    "AgentPassportClient",
    "AgentPassportError",
    "AgentPassport",
    "VerificationOptions",
    
    # Enforcement modules (re-exported from SDK)
    "AssuranceLevel",
    "AssuranceEnforcementConfig",
    "AssuranceLevelMetadata",
    "meets_minimum_assurance",
    "get_required_assurance_level",
    "get_operation_from_path",
    "get_upgrade_instructions",
    "check_assurance_requirement",
    "require_email_verified",
    "require_github_verified",
    "require_domain_verified",
    "require_kyc_verified",
    "require_financial_verified",
    "ASSURANCE_LEVEL_METADATA",
    
    "CapabilityEnforcementConfig",
    "create_capability_enforcer",
    "check_capability_requirement",
    
    "LimitsEnforcementConfig",
    "LimitChecker",
    "create_limit_checker",
    "check_limits_for_operation",
    
    "MCPHeaders",
    "MCPEnforcementConfig",
    "extract_mcp_headers_from_dict",
    "is_mcp_server_allowed",
    "is_mcp_tool_allowed",
    "validate_mcp_headers",
    "check_mcp_requirement",
    "policy_requires_mcp_enforcement",
    "has_mcp_headers",
    "get_mcp_headers",
    
    "PolicyPack",
    "PassportData",
    "PolicyResult",
    "PolicyEnforcementConfig",
    "check_policy_compliance",
    "check_policy_sync",
    
    "RegionValidationConfig",
    "validate_region",
    "validate_regions",
    "is_valid_region",
    "is_agent_authorized_in_region",
    "check_region_requirements",
    "require_us_regions",
    "require_eu_regions",
    "require_north_america_regions",
    
    # Taxonomy validation
    "TaxonomyValidationConfig",
    "validate_categories",
    "validate_frameworks",
    "validate_agent_taxonomy",
    "check_taxonomy_requirements",
    "get_agent_categories",
    "get_agent_frameworks",
    "has_required_categories",
    "has_required_frameworks",
    
    # FastAPI middleware
    "AgentPassportMiddleware",
    "agent_passport_middleware",
    "has_agent_permission",
    "is_agent_allowed_in_region", 
    "get_agent",
    "has_agent",
    "AgentPassportMiddlewareOptions",
]
