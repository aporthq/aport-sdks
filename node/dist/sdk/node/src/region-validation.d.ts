/**
 * Region Validation SDK for Agent Passport
 *
 * Provides framework-agnostic ISO-3166 region validation
 */
/**
 * Region validation configuration
 */
export interface RegionValidationConfig {
    enabled: boolean;
    strictMode: boolean;
    logViolations: boolean;
    allowedRegions?: string[];
}
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
export declare function validateAgentRegions(agent: any): {
    valid: boolean;
    regions: string[];
    errors: string[];
};
/**
 * Check if a region is allowed for an agent
 */
export declare function isAllowedInRegion(agent: any, region: string, config?: Partial<RegionValidationConfig>): RegionValidationResult;
/**
 * Validate regions for an agent
 */
export declare function validateRegionsForAgent(agent: any, config?: Partial<RegionValidationConfig>): RegionValidationResult;
//# sourceMappingURL=region-validation.d.ts.map