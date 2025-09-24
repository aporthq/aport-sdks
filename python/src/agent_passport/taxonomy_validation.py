"""
Taxonomy Validation for Agent Passport SDK

Provides framework-agnostic taxonomy validation for agent capabilities.
"""

from typing import Dict, List, Optional, Any
from dataclasses import dataclass


@dataclass
class TaxonomyValidationConfig:
    """Configuration for taxonomy validation"""
    enabled: bool = True
    strict_mode: bool = True  # If true, reject requests with invalid taxonomy
    log_violations: bool = True  # Log taxonomy violations for monitoring
    require_categories: Optional[List[str]] = None  # Required categories
    require_frameworks: Optional[List[str]] = None  # Required frameworks


# Capability to category mapping (simplified version)
CAPABILITY_CATEGORY_MAP = {
    # Payment capabilities
    "payments.refund": "financial",
    "payments.payout": "financial",
    "payments.process": "financial",
    
    # Data capabilities
    "data.export": "data_management",
    "data.delete": "data_management",
    "data.analyze": "data_management",
    
    # Communication capabilities
    "messaging.send": "communication",
    "messaging.email": "communication",
    "messaging.slack": "communication",
    "messaging.discord": "communication",
    
    # Development capabilities
    "repo.pr.create": "development",
    "repo.merge": "development",
    "repo.deploy": "development",
    "infra.deploy": "development",
    
    # Identity capabilities
    "identity.manage_roles": "identity",
    "identity.manage_users": "identity",
    
    # CRM capabilities
    "crm.update": "business",
    "crm.manage": "business",
    
    # Returns capabilities
    "returns.process": "business",
    
    # Inventory capabilities
    "inventory.adjust": "business",
}

# Capability to framework mapping (simplified version)
CAPABILITY_FRAMEWORK_MAP = {
    # Web frameworks
    "payments.refund": "web",
    "payments.payout": "web",
    "data.export": "web",
    "messaging.send": "web",
    
    # API frameworks
    "repo.pr.create": "api",
    "repo.merge": "api",
    "infra.deploy": "api",
    
    # Database frameworks
    "data.delete": "database",
    "data.analyze": "database",
    
    # Communication frameworks
    "messaging.email": "email",
    "messaging.slack": "slack",
    "messaging.discord": "discord",
}

# Valid categories
VALID_CATEGORIES = {
    "financial", "data_management", "communication", "development", 
    "identity", "business", "security", "analytics", "automation"
}

# Valid frameworks
VALID_FRAMEWORKS = {
    "web", "api", "database", "email", "slack", "discord", 
    "mobile", "desktop", "cli", "cloud", "edge"
}


def get_categories_by_capability(capabilities: List[str]) -> List[str]:
    """Get categories for a list of capabilities"""
    categories = set()
    for capability in capabilities:
        category = CAPABILITY_CATEGORY_MAP.get(capability)
        if category:
            categories.add(category)
    return list(categories)


def get_frameworks_by_capability(capabilities: List[str]) -> List[str]:
    """Get frameworks for a list of capabilities"""
    frameworks = set()
    for capability in capabilities:
        framework = CAPABILITY_FRAMEWORK_MAP.get(capability)
        if framework:
            frameworks.add(framework)
    return list(frameworks)


def validate_categories(categories: List[str]) -> Dict[str, Any]:
    """Validate a list of categories"""
    errors = []
    warnings = []
    
    if not isinstance(categories, list):
        errors.append("Categories must be a list")
        return {"valid": False, "errors": errors, "warnings": warnings}
    
    for category in categories:
        if not isinstance(category, str):
            errors.append(f"Category must be a string: {category}")
            continue
            
        if category not in VALID_CATEGORIES:
            warnings.append(f"Unknown category: {category}")
    
    return {"valid": len(errors) == 0, "errors": errors, "warnings": warnings}


def validate_frameworks(frameworks: List[str]) -> Dict[str, Any]:
    """Validate a list of frameworks"""
    errors = []
    warnings = []
    
    if not isinstance(frameworks, list):
        errors.append("Frameworks must be a list")
        return {"valid": False, "errors": errors, "warnings": warnings}
    
    for framework in frameworks:
        if not isinstance(framework, str):
            errors.append(f"Framework must be a string: {framework}")
            continue
            
        if framework not in VALID_FRAMEWORKS:
            warnings.append(f"Unknown framework: {framework}")
    
    return {"valid": len(errors) == 0, "errors": errors, "warnings": warnings}


def validate_agent_taxonomy(agent_data: Dict[str, Any]) -> Dict[str, Any]:
    """Validate taxonomy for an agent"""
    if not agent_data or not agent_data.get("capabilities"):
        return {
            "valid": False,
            "categories": [],
            "frameworks": [],
            "errors": ["No capabilities configured"]
        }
    
    capabilities = agent_data["capabilities"]
    if isinstance(capabilities, list):
        # Extract capability IDs
        capability_ids = []
        for cap in capabilities:
            if isinstance(cap, str):
                capability_ids.append(cap)
            elif isinstance(cap, dict) and "id" in cap:
                capability_ids.append(cap["id"])
            else:
                capability_ids.append(str(cap))
    else:
        capability_ids = []
    
    categories = get_categories_by_capability(capability_ids)
    frameworks = get_frameworks_by_capability(capability_ids)
    
    category_validation = validate_categories(categories)
    framework_validation = validate_frameworks(frameworks)
    
    errors = []
    if not category_validation["valid"]:
        errors.extend(category_validation["errors"])
    if not framework_validation["valid"]:
        errors.extend(framework_validation["errors"])
    
    return {
        "valid": category_validation["valid"] and framework_validation["valid"],
        "categories": categories,
        "frameworks": frameworks,
        "errors": errors
    }


def check_taxonomy_requirements(
    agent_data: Dict[str, Any],
    required_categories: Optional[List[str]] = None,
    required_frameworks: Optional[List[str]] = None,
    config: Optional[TaxonomyValidationConfig] = None
) -> Dict[str, Any]:
    """
    Check taxonomy requirements for an agent.
    
    Args:
        agent_data: Agent data dictionary
        required_categories: List of required categories
        required_frameworks: List of required frameworks
        config: Taxonomy validation configuration
        
    Returns:
        Dictionary with check results and error details if applicable
    """
    if config is None:
        config = TaxonomyValidationConfig()
    
    if not config.enabled:
        return {"allowed": True, "reason": None}
    
    violations = []
    
    if not agent_data or not agent_data.get("capabilities"):
        violations.append({
            "type": "no_capabilities",
            "reason": "No capabilities configured for this agent"
        })
        return {
            "allowed": not config.strict_mode,
            "violations": violations,
            "categories": [],
            "frameworks": []
        }
    
    # Get agent taxonomy
    taxonomy_result = validate_agent_taxonomy(agent_data)
    categories = taxonomy_result["categories"]
    frameworks = taxonomy_result["frameworks"]
    
    # Check required categories
    if required_categories:
        for required_category in required_categories:
            if required_category not in categories:
                violations.append({
                    "type": "missing_category",
                    "reason": f"Required category {required_category} not found",
                    "category": required_category
                })
    
    # Check required frameworks
    if required_frameworks:
        for required_framework in required_frameworks:
            if required_framework not in frameworks:
                violations.append({
                    "type": "missing_framework",
                    "reason": f"Required framework {required_framework} not found",
                    "framework": required_framework
                })
    
    # Check config requirements
    if config.require_categories:
        for required_category in config.require_categories:
            if required_category not in categories:
                violations.append({
                    "type": "missing_required_category",
                    "reason": f"Required category {required_category} not found",
                    "category": required_category
                })
    
    if config.require_frameworks:
        for required_framework in config.require_frameworks:
            if required_framework not in frameworks:
                violations.append({
                    "type": "missing_required_framework",
                    "reason": f"Required framework {required_framework} not found",
                    "framework": required_framework
                })
    
    if violations:
        return {
            "allowed": False,
            "reason": "taxonomy_requirements_not_met",
            "violations": violations,
            "categories": categories,
            "frameworks": frameworks
        }
    
    return {
        "allowed": True,
        "reason": None,
        "categories": categories,
        "frameworks": frameworks
    }


def get_agent_categories(agent_data: Dict[str, Any]) -> List[str]:
    """Get categories for an agent"""
    if not agent_data or not agent_data.get("capabilities"):
        return []
    
    capabilities = agent_data["capabilities"]
    if isinstance(capabilities, list):
        capability_ids = []
        for cap in capabilities:
            if isinstance(cap, str):
                capability_ids.append(cap)
            elif isinstance(cap, dict) and "id" in cap:
                capability_ids.append(cap["id"])
            else:
                capability_ids.append(str(cap))
    else:
        capability_ids = []
    
    return get_categories_by_capability(capability_ids)


def get_agent_frameworks(agent_data: Dict[str, Any]) -> List[str]:
    """Get frameworks for an agent"""
    if not agent_data or not agent_data.get("capabilities"):
        return []
    
    capabilities = agent_data["capabilities"]
    if isinstance(capabilities, list):
        capability_ids = []
        for cap in capabilities:
            if isinstance(cap, str):
                capability_ids.append(cap)
            elif isinstance(cap, dict) and "id" in cap:
                capability_ids.append(cap["id"])
            else:
                capability_ids.append(str(cap))
    else:
        capability_ids = []
    
    return get_frameworks_by_capability(capability_ids)


def has_required_categories(
    agent_data: Dict[str, Any],
    required_categories: List[str],
    config: Optional[TaxonomyValidationConfig] = None
) -> bool:
    """Check if agent has all required categories"""
    result = check_taxonomy_requirements(
        agent_data, 
        required_categories=required_categories, 
        config=config
    )
    return result["allowed"]


def has_required_frameworks(
    agent_data: Dict[str, Any],
    required_frameworks: List[str],
    config: Optional[TaxonomyValidationConfig] = None
) -> bool:
    """Check if agent has all required frameworks"""
    result = check_taxonomy_requirements(
        agent_data, 
        required_frameworks=required_frameworks, 
        config=config
    )
    return result["allowed"]
