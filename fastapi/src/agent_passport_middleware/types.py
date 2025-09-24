"""Type definitions for the FastAPI middleware."""

from typing import List, Optional, Dict
from dataclasses import dataclass
from agent_passport.shared_types import PassportData
from agent_passport import CapabilityEnforcementConfig, LimitsEnforcementConfig

# Re-export the shared type
AgentPassport = PassportData


@dataclass
class AgentPassportMiddlewareOptions:
    """Options for the Agent Passport middleware."""
    
    base_url: Optional[str] = None
    timeout: int = 5
    cache: bool = True
    fail_closed: bool = True
    required_permissions: List[str] = None
    allowed_regions: List[str] = None
    skip_paths: List[str] = None
    skip_methods: List[str] = None
    capability_enforcement: Optional[CapabilityEnforcementConfig] = None
    limits_enforcement: Optional[LimitsEnforcementConfig] = None
    
    def __post_init__(self):
        """Initialize default values for lists."""
        if self.required_permissions is None:
            self.required_permissions = []
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
