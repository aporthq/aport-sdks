"""
Region Validation for Agent Passport SDK

Provides ISO-3166 region validation for agent passport middleware
"""

from typing import Dict, Optional, List, Any, Set
from dataclasses import dataclass
import re


@dataclass
class RegionValidationConfig:
    """Configuration for region validation"""
    enabled: bool = True
    strict_mode: bool = True  # If True, reject agents with invalid regions
    log_violations: bool = True  # Log region violations for monitoring
    allowed_regions: Optional[List[str]] = None  # Specific regions to allow (optional)


# ISO-3166-1 Alpha-2 country codes (same as in regions.ts)
ISO_3166_COUNTRIES = {
    "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
    "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ",
    "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ",
    "DE", "DJ", "DK", "DM", "DO", "DZ",
    "EC", "EE", "EG", "EH", "ER", "ES", "ET",
    "FI", "FJ", "FK", "FM", "FO", "FR",
    "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY",
    "HK", "HM", "HN", "HR", "HT", "HU",
    "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT",
    "JE", "JM", "JO", "JP",
    "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ",
    "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY",
    "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ",
    "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ",
    "OM",
    "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY",
    "QA",
    "RE", "RO", "RS", "RU", "RW",
    "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ",
    "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ",
    "UA", "UG", "UM", "US", "UY", "UZ",
    "VA", "VC", "VE", "VG", "VI", "VN", "VU",
    "WF", "WS",
    "YE", "YT",
    "ZA", "ZM", "ZW"
}

# Common subdivision codes (subset for performance)
ISO_3166_SUBDIVISIONS = {
    # US States
    "US-AL", "US-AK", "US-AZ", "US-AR", "US-CA", "US-CO", "US-CT", "US-DE", "US-FL", "US-GA",
    "US-HI", "US-ID", "US-IL", "US-IN", "US-IA", "US-KS", "US-KY", "US-LA", "US-ME", "US-MD",
    "US-MA", "US-MI", "US-MN", "US-MS", "US-MO", "US-MT", "US-NE", "US-NV", "US-NH", "US-NJ",
    "US-NM", "US-NY", "US-NC", "US-ND", "US-OH", "US-OK", "US-OR", "US-PA", "US-RI", "US-SC",
    "US-SD", "US-TN", "US-TX", "US-UT", "US-VT", "US-VA", "US-WA", "US-WV", "US-WI", "US-WY",
    "US-DC",
    # Canada
    "CA-AB", "CA-BC", "CA-MB", "CA-NB", "CA-NL", "CA-NS", "CA-NT", "CA-NU", "CA-ON", "CA-PE",
    "CA-QC", "CA-SK", "CA-YT",
    # Add more as needed...
}


def validate_region(region: str) -> Dict[str, Any]:
    """Validate a single region code"""
    errors = []
    warnings = []
    
    if not region or not isinstance(region, str):
        errors.append("Region must be a non-empty string")
        return {"valid": False, "errors": errors, "warnings": warnings}
    
    region_upper = region.upper().strip()
    
    # Check format
    if not re.match(r'^[A-Z]{2}(-[A-Z0-9]{1,3})?$', region_upper):
        errors.append(f"Invalid region format: {region}. Must be ISO-3166 format (CC or CC-SS)")
        return {"valid": False, "errors": errors, "warnings": warnings}
    
    # Split into country and subdivision
    parts = region_upper.split("-")
    country_code = parts[0]
    subdivision_code = parts[1] if len(parts) > 1 else None
    
    # Validate country code
    if country_code not in ISO_3166_COUNTRIES:
        errors.append(f"Invalid country code: {country_code}")
        return {"valid": False, "errors": errors, "warnings": warnings}
    
    # If subdivision is provided, validate it
    if subdivision_code:
        full_code = f"{country_code}-{subdivision_code}"
        if full_code not in ISO_3166_SUBDIVISIONS:
            # Don't error on unknown subdivisions, just warn
            warnings.append(f"Unknown subdivision code: {full_code}. Verify this is a valid ISO-3166-2 code.")
    
    return {"valid": len(errors) == 0, "errors": errors, "warnings": warnings}


def validate_regions(regions: List[str]) -> Dict[str, Any]:
    """Validate an array of region codes"""
    errors = []
    warnings = []
    
    if not isinstance(regions, list):
        errors.append("Regions must be an array")
        return {"valid": False, "errors": errors, "warnings": warnings}
    
    # Check for duplicates
    unique_regions = set()
    duplicates = []
    
    for region in regions:
        region_upper = region.upper().strip()
        if region_upper in unique_regions:
            duplicates.append(region)
        else:
            unique_regions.add(region_upper)
        
        # Validate individual region
        result = validate_region(region)
        errors.extend(result["errors"])
        warnings.extend(result["warnings"])
    
    if duplicates:
        errors.append(f"Duplicate regions: {', '.join(duplicates)}")
    
    return {"valid": len(errors) == 0, "errors": errors, "warnings": warnings}


def is_valid_region(region: str) -> bool:
    """Fast validation check for a region"""
    if not region or not isinstance(region, str):
        return False
    
    region_upper = region.upper().strip()
    
    # Check format
    if not re.match(r'^[A-Z]{2}(-[A-Z0-9]{1,3})?$', region_upper):
        return False
    
    # Check country code
    country_code = region_upper.split("-")[0]
    return country_code in ISO_3166_COUNTRIES


def is_agent_authorized_in_region(agent_regions: List[str], region: str) -> bool:
    """Check if agent is authorized in a specific region"""
    if not agent_regions:
        return False
    
    region_upper = region.upper()
    
    for agent_region in agent_regions:
        agent_region_upper = agent_region.upper()
        
        # Exact match or agent region is more specific
        if (agent_region_upper == region_upper or 
            agent_region_upper.startswith(region_upper + "-")):
            return True
    
    return False


def check_region_requirements(
    agent_regions: List[str],
    required_regions: Optional[List[str]] = None,
    config: Optional[RegionValidationConfig] = None
) -> Dict[str, Any]:
    """
    Check region requirements for an agent.
    
    Args:
        agent_regions: List of regions the agent is authorized for
        required_regions: List of regions that are required (optional)
        config: Region validation configuration
        
    Returns:
        Dictionary with check results and error details if applicable
    """
    if config is None:
        config = RegionValidationConfig()
    
    if not config.enabled:
        return {"allowed": True, "reason": None}
    
    try:
        # Validate ISO-3166 compliance
        validation = validate_regions(agent_regions or [])
        
        if not validation["valid"]:
            if config.strict_mode:
                return {
                    "allowed": False,
                    "reason": "invalid_regions",
                    "error": "Agent passport contains invalid region codes",
                    "invalid_regions": validation["errors"],
                    "current_regions": agent_regions,
                    "requirements": "Regions must be valid ISO-3166 country codes (CC or CC-SS format)",
                }
            elif config.log_violations:
                print(f"Region validation warning: {', '.join(validation['errors'])}")
        
        # Log warnings if any
        if validation["warnings"] and config.log_violations:
            print(f"Region validation warnings: {', '.join(validation['warnings'])}")
        
        # Check allowed regions if specified
        if config.allowed_regions:
            has_allowed_region = any(
                is_agent_authorized_in_region(agent_regions, allowed_region)
                for allowed_region in config.allowed_regions
            )
            
            if not has_allowed_region:
                return {
                    "allowed": False,
                    "reason": "region_not_allowed",
                    "error": "Agent is not authorized for any allowed regions",
                    "allowed_regions": config.allowed_regions,
                    "agent_regions": agent_regions,
                }
        
        # Check required regions if specified
        if required_regions:
            has_required_region = any(
                is_agent_authorized_in_region(agent_regions, required_region)
                for required_region in required_regions
            )
            
            if not has_required_region:
                return {
                    "allowed": False,
                    "reason": "region_not_allowed",
                    "error": f"Agent must be authorized in one of: {', '.join(required_regions)}",
                    "required_regions": required_regions,
                    "agent_regions": agent_regions,
                }
        
        return {"allowed": True, "reason": None}
        
    except Exception as e:
        if config.log_violations:
            print(f"Error in region validation: {e}")
        
        return {
            "allowed": False,
            "reason": "region_validation_error",
            "error": "Failed to validate agent regions",
        }


# Convenience functions for common regions
def require_us_regions(agent_regions: List[str]) -> bool:
    """Check if agent is authorized for US regions"""
    return is_agent_authorized_in_region(agent_regions, "US")


def require_eu_regions(agent_regions: List[str]) -> bool:
    """Check if agent is authorized for EU regions"""
    eu_countries = ["DE", "FR", "IT", "ES", "NL", "BE", "AT", "SE", "DK", "FI", "NO"]
    return any(is_agent_authorized_in_region(agent_regions, country) for country in eu_countries)


def require_north_america_regions(agent_regions: List[str]) -> bool:
    """Check if agent is authorized for North American regions"""
    na_countries = ["US", "CA", "MX"]
    return any(is_agent_authorized_in_region(agent_regions, country) for country in na_countries)
