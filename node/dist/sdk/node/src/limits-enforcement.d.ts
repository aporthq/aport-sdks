/**
 * Limits Enforcement SDK for Agent Passport
 *
 * Provides framework-agnostic enforcement of passport limits with performance optimizations
 * for edge computing environments.
 */
import { TypedLimits } from "../../../functions/utils/limits";
/**
 * Limits enforcement configuration
 */
export interface LimitsEnforcementConfig {
    enabled: boolean;
    strictMode: boolean;
    logViolations: boolean;
    customCheckers?: Record<string, (limits: TypedLimits, context: any) => {
        allowed: boolean;
        reason?: string;
    }>;
}
/**
 * Limits enforcement result
 */
export interface LimitsEnforcementResult {
    allowed: boolean;
    violations: Array<{
        type: string;
        reason: string;
        limit?: string;
        value?: any;
        maxValue?: any;
    }>;
    limits: Record<string, any>;
}
/**
 * Check if a request is within limits
 */
export declare function checkLimits(agent: any, context: any, config?: Partial<LimitsEnforcementConfig>): LimitsEnforcementResult;
/**
 * Check if a specific limit is exceeded
 */
export declare function isLimitExceeded(agent: any, limitKey: string, context: any, config?: Partial<LimitsEnforcementConfig>): {
    allowed: boolean;
    reason?: string;
    value?: any;
    maxValue?: any;
};
/**
 * Get all limits for an agent
 */
export declare function getAgentLimits(agent: any): Record<string, any>;
/**
 * Validate limits configuration
 */
export declare function validateLimitsConfig(limits: Record<string, any>): {
    valid: boolean;
    errors: string[];
};
//# sourceMappingURL=limits-enforcement.d.ts.map