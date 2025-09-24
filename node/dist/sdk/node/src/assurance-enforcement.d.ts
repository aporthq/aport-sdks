/**
 * Assurance Enforcement SDK for Agent Passport
 *
 * Provides minimum assurance level enforcement with performance optimizations
 * for edge computing environments.
 */
import { AssuranceLevel } from "../../../functions/utils/assurance";
/**
 * Assurance enforcement configuration
 */
export interface AssuranceEnforcementConfig {
    enabled: boolean;
    strictMode: boolean;
    logViolations: boolean;
    defaultMinimum?: AssuranceLevel;
    routeRequirements?: Record<string, AssuranceLevel>;
}
/**
 * Default assurance enforcement configuration
 */
export declare const DEFAULT_ASSURANCE_CONFIG: AssuranceEnforcementConfig;
/**
 * Assurance enforcement result
 */
export interface AssuranceEnforcementResult {
    allowed: boolean;
    violations: Array<{
        type: string;
        reason: string;
        required?: AssuranceLevel;
        actual?: AssuranceLevel;
    }>;
    assuranceLevel: AssuranceLevel | null;
    isExpired: boolean;
    metadata: any;
}
/**
 * Check if agent meets minimum assurance requirements
 */
export declare function checkAssuranceRequirements(agent: any, requiredLevel: AssuranceLevel, config?: Partial<AssuranceEnforcementConfig>): AssuranceEnforcementResult;
/**
 * Check if agent has valid assurance
 */
export declare function hasValidAssurance(agent: any, config?: Partial<AssuranceEnforcementConfig>): boolean;
/**
 * Get assurance level for an agent
 */
export declare function getAgentAssuranceLevel(agent: any): AssuranceLevel | null;
/**
 * Check if assurance is expired
 */
export declare function isAgentAssuranceExpired(agent: any): boolean;
/**
 * Validate assurance configuration
 */
export declare function validateAssuranceConfig(assurance: any): {
    valid: boolean;
    errors: string[];
};
/**
 * Get assurance metadata for an agent
 */
export declare function getAgentAssuranceMetadata(agent: any): any;
//# sourceMappingURL=assurance-enforcement.d.ts.map