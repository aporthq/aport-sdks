"""Shared type definitions that match the TypeScript PassportData interface."""

from typing import Any, Dict, List, Optional
from dataclasses import dataclass


@dataclass
class ModelInfo:
    """Model information for the agent."""
    
    model_refs: Optional[List[Dict[str, Any]]] = None
    tools: Optional[List[Dict[str, Any]]] = None
    provenance: Optional[Dict[str, Any]] = None
    data_access: Optional[Dict[str, Any]] = None


@dataclass
class PassportData:
    """Complete agent passport data structure."""
    
    # Core Identity
    agent_id: str
    slug: str
    name: str
    owner: str
    controller_type: str  # "org" | "person"
    claimed: bool
    
    # Agent Details
    role: str
    description: str
    permissions: List[str]
    limits: Dict[str, Any]
    regions: List[str]
    
    # Status & Verification
    status: str  # "draft" | "active" | "suspended" | "revoked"
    verification_status: str  # "unverified" | "verified"
    
    # Contact & Links
    contact: str
    
    # System Metadata
    source: str  # "admin" | "form" | "crawler"
    created_at: str
    updated_at: str
    version: str
    
    # Optional fields
    verification_method: Optional[str] = None
    links: Optional[Dict[str, str]] = None
    framework: Optional[List[str]] = None
    categories: Optional[List[str]] = None
    logo_url: Optional[str] = None
    model_info: Optional[ModelInfo] = None


# Re-export for backward compatibility
AgentPassport = PassportData
