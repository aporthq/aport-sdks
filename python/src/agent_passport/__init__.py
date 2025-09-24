"""
Agent Passport SDK for Python

A Python SDK for the AI Agent Passport Registry, providing easy integration
with agent authentication and verification.
"""

from .client import AgentPassportClient, AgentPassportError
from .session import agent_session
from .types import AgentPassport, VerificationOptions

# Enforcement modules
from .assurance_enforcement import (
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
)

from .capability_enforcement import (
    ROUTE_CAPABILITY_MAP,
    get_required_capabilities,
    requires_capabilities,
    get_routes_for_capability,
    CapabilityEnforcementConfig,
    create_capability_enforcer,
    check_capability_requirement,
)

from .limits_enforcement import (
    LimitsEnforcementConfig,
    LimitChecker,
    create_limit_checker,
    check_limits_for_operation,
    has_limit,
    get_limit_value,
    check_refund_limit,
    check_export_limit,
    check_deploy_limit,
    check_pii_access,
)

from .mcp_enforcement import (
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
)

from .policy_enforcement import (
    PolicyPack,
    PassportData,
    PolicyResult,
    PolicyEnforcementConfig,
    fetch_policy_pack,
    verify_policy_compliance,
    convert_policy_response,
    check_policy_compliance,
    check_policy_sync,
    clear_policy_cache,
)

from .refunds import (
    RefundContext,
    RefundResult,
    RefundPolicyConfig,
    process_refund,
    is_refund_allowed,
    create_refund_context,
    validate_refund_context,
    REFUNDS_V1,
)

from .region_validation import (
    RegionValidationConfig,
    validate_region,
    validate_regions,
    is_valid_region,
    is_agent_authorized_in_region,
    check_region_requirements,
    require_us_regions,
    require_eu_regions,
    require_north_america_regions,
    ISO_3166_COUNTRIES,
    ISO_3166_SUBDIVISIONS,
)

from .taxonomy_validation import (
    TaxonomyValidationConfig,
    validate_categories,
    validate_frameworks,
    validate_agent_taxonomy,
    check_taxonomy_requirements,
    get_agent_categories,
    get_agent_frameworks,
    has_required_categories,
    has_required_frameworks,
    get_categories_by_capability,
    get_frameworks_by_capability,
    CAPABILITY_CATEGORY_MAP,
    CAPABILITY_FRAMEWORK_MAP,
    VALID_CATEGORIES,
    VALID_FRAMEWORKS,
)

__version__ = "0.1.0"
__all__ = [
    # Core SDK
    "AgentPassportClient",
    "AgentPassportError", 
    "agent_session",
    "AgentPassport",
    "VerificationOptions",
    
    # Assurance enforcement
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
    
    # Capability enforcement
    "ROUTE_CAPABILITY_MAP",
    "get_required_capabilities",
    "requires_capabilities",
    "get_routes_for_capability",
    "CapabilityEnforcementConfig",
    "create_capability_enforcer",
    "check_capability_requirement",
    
    # Limits enforcement
    "LimitsEnforcementConfig",
    "LimitChecker",
    "create_limit_checker",
    "check_limits_for_operation",
    "has_limit",
    "get_limit_value",
    "check_refund_limit",
    "check_export_limit",
    "check_deploy_limit",
    "check_pii_access",
    
    # MCP enforcement
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
    
    # Policy enforcement
    "PolicyPack",
    "PassportData",
    "PolicyResult",
    "PolicyEnforcementConfig",
    "fetch_policy_pack",
    "verify_policy_compliance",
    "convert_policy_response",
    "check_policy_compliance",
    "check_policy_sync",
    "clear_policy_cache",
    
    # Refunds v1 helpers
    "RefundContext",
    "RefundResult",
    "RefundPolicyConfig",
    "process_refund",
    "is_refund_allowed",
    "create_refund_context",
    "validate_refund_context",
    "REFUNDS_V1",
    
    # Region validation
    "RegionValidationConfig",
    "validate_region",
    "validate_regions",
    "is_valid_region",
    "is_agent_authorized_in_region",
    "check_region_requirements",
    "require_us_regions",
    "require_eu_regions",
    "require_north_america_regions",
    "ISO_3166_COUNTRIES",
    "ISO_3166_SUBDIVISIONS",
    
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
    "get_categories_by_capability",
    "get_frameworks_by_capability",
    "CAPABILITY_CATEGORY_MAP",
    "CAPABILITY_FRAMEWORK_MAP",
    "VALID_CATEGORIES",
    "VALID_FRAMEWORKS",
]
