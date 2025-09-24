/**
 * Region Validation SDK for Agent Passport
 *
 * Provides framework-agnostic ISO-3166 region validation
 */

import {
  validateRegions,
  regionValidator,
} from "../../../functions/utils/regions";

/**
 * Region validation configuration
 */
export interface RegionValidationConfig {
  enabled: boolean;
  strictMode: boolean; // If true, reject requests from unauthorized regions
  logViolations: boolean; // Log region violations for monitoring
  allowedRegions?: string[]; // Override agent's allowed regions
}

/**
 * Default region validation configuration
 */
const DEFAULT_CONFIG: RegionValidationConfig = {
  enabled: true,
  strictMode: true,
  logViolations: true,
};

/**
 * Region validation result
 */
export interface RegionValidationResult {
  allowed: boolean;
  violations: Array<{
    type: string;
    reason: string;
  }>;
  allowedRegions: string[];
  detectedRegion?: string;
}

/**
 * Validate agent regions
 */
export function validateAgentRegions(agent: any): {
  valid: boolean;
  regions: string[];
  errors: string[];
} {
  if (!agent || !agent.regions) {
    return {
      valid: false,
      regions: [],
      errors: ["No regions configured"],
    };
  }

  const validation = validateRegions(agent.regions);
  return {
    valid: validation.valid,
    regions: agent.regions,
    errors: validation.errors || [],
  };
}

/**
 * Check if a region is allowed for an agent
 */
export function isAllowedInRegion(
  agent: any,
  region: string,
  config: Partial<RegionValidationConfig> = {}
): RegionValidationResult {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  if (!finalConfig.enabled) {
    return {
      allowed: true,
      violations: [],
      allowedRegions: [],
    };
  }

  const violations: Array<{ type: string; reason: string }> = [];

  // Get allowed regions (from config override or agent)
  const allowedRegions = finalConfig.allowedRegions || agent.regions || [];

  if (allowedRegions.length === 0) {
    if (finalConfig.strictMode) {
      violations.push({
        type: "no_regions_configured",
        reason: "No regions configured for this agent",
      });
    }
    return { allowed: !finalConfig.strictMode, violations, allowedRegions };
  }

  // Validate the region
  const isValidRegion = regionValidator.isValid(region);
  if (!isValidRegion) {
    violations.push({
      type: "invalid_region",
      reason: `Invalid region code: ${region}`,
    });
    return { allowed: false, violations, allowedRegions };
  }

  // Check if region is in allowed list
  const isAllowed = allowedRegions.some((allowedRegion: string) => {
    if (allowedRegion.includes("*")) {
      // Wildcard matching
      const pattern = allowedRegion.replace(/\*/g, ".*");
      return new RegExp(`^${pattern}$`).test(region);
    }
    return allowedRegion === region;
  });

  if (!isAllowed) {
    violations.push({
      type: "region_not_allowed",
      reason: `Region ${region} is not in allowed regions: ${allowedRegions.join(
        ", "
      )}`,
    });
  }

  return {
    allowed: isAllowed,
    violations,
    allowedRegions,
    detectedRegion: region,
  };
}

/**
 * Validate regions for an agent
 */
export function validateRegionsForAgent(
  agent: any,
  config: Partial<RegionValidationConfig> = {}
): RegionValidationResult {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  if (!finalConfig.enabled) {
    return {
      allowed: true,
      violations: [],
      allowedRegions: [],
    };
  }

  const violations: Array<{ type: string; reason: string }> = [];

  // Get allowed regions (from config override or agent)
  const allowedRegions = finalConfig.allowedRegions || agent.regions || [];

  if (allowedRegions.length === 0) {
    if (finalConfig.strictMode) {
      violations.push({
        type: "no_regions_configured",
        reason: "No regions configured for this agent",
      });
    }
    return { allowed: !finalConfig.strictMode, violations, allowedRegions };
  }

  // Validate all regions
  const regionValidation = validateRegions(allowedRegions);
  if (!regionValidation.valid) {
    violations.push({
      type: "invalid_regions",
      reason: `Invalid regions: ${regionValidation.errors?.join(", ")}`,
    });
  }

  return {
    allowed: regionValidation.valid,
    violations,
    allowedRegions,
  };
}
