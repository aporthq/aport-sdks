"""Type definitions for the FastAPI middleware."""

from typing import List, Optional, Dict, Any, Callable
from dataclasses import dataclass
from fastapi import Request, Response
from aporthq_sdk_python import (
    CapabilityEnforcementConfig, 
    LimitsEnforcementConfig,
    AssuranceEnforcementConfig,
    RegionValidationConfig,
    TaxonomyValidationConfig,
    MCPEnforcementConfig,
    PassportData
)

# Re-export the shared type
AgentPassport = PassportData


@dataclass
class PolicyResult:
    """Policy evaluation result"""
    allowed: bool
    evaluation: Optional[Dict[str, Any]] = None
    error: Optional[Dict[str, Any]] = None


@dataclass
class PolicyEvaluation:
    """Policy evaluation details"""
    decision_id: Optional[str] = None
    remaining_daily_cap: Optional[int] = None
    violations: List[str] = None
    warnings: List[str] = None
    
    def __post_init__(self):
        if self.violations is None:
            self.violations = []
        if self.warnings is None:
            self.warnings = []


@dataclass
class AgentPassportMiddlewareOptions:
    """Options for the Agent Passport middleware."""
    
    base_url: Optional[str] = None
    timeout: int = 5
    cache: bool = True
    fail_closed: bool = True
    allowed_regions: List[str] = None
    skip_paths: List[str] = None
    skip_methods: List[str] = None
    capability_enforcement: Optional[CapabilityEnforcementConfig] = None
    limits_enforcement: Optional[LimitsEnforcementConfig] = None
    assurance_enforcement: Optional[AssuranceEnforcementConfig] = None
    region_validation: Optional[RegionValidationConfig] = None
    taxonomy_validation: Optional[TaxonomyValidationConfig] = None
    mcp_enforcement: Optional[MCPEnforcementConfig] = None
    policy_id: Optional[str] = None
    
    def __post_init__(self):
        """Initialize default values for lists."""
        if self.allowed_regions is None:
            self.allowed_regions = []
        if self.skip_paths is None:
            self.skip_paths = []
        if self.skip_methods is None:
            self.skip_methods = ['OPTIONS']
        if self.capability_enforcement is None:
            self.capability_enforcement = CapabilityEnforcementConfig()
        if self.limits_enforcement is None:
            self.limits_enforcement = LimitsEnforcementConfig()
        if self.assurance_enforcement is None:
            self.assurance_enforcement = AssuranceEnforcementConfig()
        if self.region_validation is None:
            self.region_validation = RegionValidationConfig()
        if self.taxonomy_validation is None:
            self.taxonomy_validation = TaxonomyValidationConfig()
        if self.mcp_enforcement is None:
            self.mcp_enforcement = MCPEnforcementConfig()


# Type aliases for middleware functions
AgentPassportMiddleware = Callable[[Request, Response], None]
PolicyMiddleware = Callable[[Request, Response], None]
