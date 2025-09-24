"use strict";
/**
 * Region Validation SDK for Agent Passport
 *
 * Provides framework-agnostic ISO-3166 region validation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAgentRegions = validateAgentRegions;
exports.isAllowedInRegion = isAllowedInRegion;
exports.validateRegionsForAgent = validateRegionsForAgent;
const regions_1 = require("../../../functions/utils/regions");
/**
 * Default region validation configuration
 */
const DEFAULT_CONFIG = {
    enabled: true,
    strictMode: true,
    logViolations: true,
};
/**
 * Validate agent regions
 */
function validateAgentRegions(agent) {
    if (!agent || !agent.regions) {
        return {
            valid: false,
            regions: [],
            errors: ["No regions configured"],
        };
    }
    const validation = (0, regions_1.validateRegions)(agent.regions);
    return {
        valid: validation.valid,
        regions: agent.regions,
        errors: validation.errors || [],
    };
}
/**
 * Check if a region is allowed for an agent
 */
function isAllowedInRegion(agent, region, config = {}) {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    if (!finalConfig.enabled) {
        return {
            allowed: true,
            violations: [],
            allowedRegions: [],
        };
    }
    const violations = [];
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
    const isValidRegion = regions_1.regionValidator.isValid(region);
    if (!isValidRegion) {
        violations.push({
            type: "invalid_region",
            reason: `Invalid region code: ${region}`,
        });
        return { allowed: false, violations, allowedRegions };
    }
    // Check if region is in allowed list
    const isAllowed = allowedRegions.some((allowedRegion) => {
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
            reason: `Region ${region} is not in allowed regions: ${allowedRegions.join(", ")}`,
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
function validateRegionsForAgent(agent, config = {}) {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    if (!finalConfig.enabled) {
        return {
            allowed: true,
            violations: [],
            allowedRegions: [],
        };
    }
    const violations = [];
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
    const regionValidation = (0, regions_1.validateRegions)(allowedRegions);
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
//# sourceMappingURL=region-validation.js.map