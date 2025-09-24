"""Type definitions for the Agent Passport SDK."""

from typing import Any, Dict, List, Optional
from dataclasses import dataclass
from .shared_types import PassportData

# Re-export the shared type
AgentPassport = PassportData


@dataclass
class VerificationOptions:
    """Options for agent passport verification."""
    
    base_url: Optional[str] = None
    cache: bool = True
    timeout: int = 5
