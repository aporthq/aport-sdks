/**
 * Typed Limits Schema and Validation
 *
 * This module provides a strongly-typed limits system with validation,
 * enforcement, and performance optimizations for edge computing.
 */
/**
 * Valid limit keys - single source of truth
 */
export type LimitKey = "refund_amount_max_per_tx" | "refund_amount_daily_cap" | "supported_currencies" | "currency_limits" | "refund_reason_codes" | "payout_usd_daily_cap" | "max_actions_per_min" | "max_export_rows" | "allow_pii" | "max_deploys_per_day" | "msgs_per_min" | "msgs_per_day" | "max_prs_per_day" | "max_merges_per_day" | "max_pr_size_kb" | "allowed_repos" | "allowed_base_branches" | "allowed_paths" | "requires_review";
/**
 * Limit value types
 */
export type LimitValue = number | boolean | string[] | Record<string, any>;
/**
 * Refund currency limit structure
 */
export interface RefundCurrencyLimit {
    max_per_tx: number;
    daily_cap: number;
}
/**
 * Typed limits interface with all valid keys
 */
export interface TypedLimits {
    refund_amount_max_per_tx?: number;
    refund_amount_daily_cap?: number;
    supported_currencies?: string[];
    currency_limits?: Record<string, RefundCurrencyLimit>;
    refund_reason_codes?: string[];
    payout_usd_daily_cap?: number;
    max_actions_per_min?: number;
    max_export_rows?: number;
    allow_pii?: boolean;
    max_deploys_per_day?: number;
    msgs_per_min?: number;
    msgs_per_day?: number;
    max_prs_per_day?: number;
    max_merges_per_day?: number;
    max_pr_size_kb?: number;
    allowed_repos?: string[];
    allowed_base_branches?: string[];
    allowed_paths?: string[];
    requires_review?: boolean;
}
/**
 * Limit metadata for validation and documentation
 */
export interface LimitMetadata {
    key: LimitKey;
    type: "number" | "boolean" | "string[]" | "object";
    min?: number;
    max?: number;
    description: string;
    category: "payments" | "data" | "actions" | "deployment" | "privacy" | "messaging" | "repository";
    relatedCapabilities: string[];
    validationRules: string[];
}
/**
 * Complete registry of all valid limits with metadata
 */
export declare const LIMIT_METADATA: Record<LimitKey, LimitMetadata>;
/**
 * Validation result for limits
 */
export interface LimitValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
/**
 * Validate a single limit value
 */
export declare function validateLimitValue(key: LimitKey, value: LimitValue): LimitValidationResult;
/**
 * Validate a complete limits object
 */
export declare function validateLimits(limits: Record<string, any>): LimitValidationResult;
/**
 * Get limits related to a specific capability
 */
export declare function getLimitsForCapability(capabilityId: string): LimitKey[];
/**
 * Get all limits by category
 */
export declare function getLimitsByCategory(category: LimitMetadata["category"]): LimitKey[];
/**
 * Check if a limit is enforced for a capability
 */
export declare function isLimitEnforcedForCapability(limitKey: LimitKey, capabilityId: string): boolean;
/**
 * Get limit enforcement rules for documentation
 */
export declare function getLimitEnforcementRules(limitKey: LimitKey): string[];
/**
 * OPTIMIZED: Fast limit checking for edge performance
 * Pre-validates limits and creates optimized checkers
 */
export declare class LimitChecker {
    private limits;
    private dailyCounters;
    constructor(limits: TypedLimits);
    /**
     * Check if a refund amount is within limits
     */
    checkRefundLimit(amountCents: number): {
        allowed: boolean;
        reason?: string;
    };
    /**
     * Check if an export is within row limits
     */
    checkExportLimit(rowCount: number, hasPII?: boolean): {
        allowed: boolean;
        reason?: string;
    };
    /**
     * Check if a deployment is within daily limits
     */
    checkDeployLimit(): {
        allowed: boolean;
        reason?: string;
        remaining?: number;
    };
    /**
     * Check action rate limit
     */
    checkActionRateLimit(): {
        allowed: boolean;
        reason?: string;
    };
    /**
     * Check if messaging is within rate limits
     */
    checkMessagingLimit(): {
        allowed: boolean;
        reason?: string;
    };
    /**
     * Check if PR creation is within limits
     */
    checkPRLimit(): {
        allowed: boolean;
        reason?: string;
        remaining?: number;
    };
    /**
     * Check if merge is within limits
     */
    checkMergeLimit(): {
        allowed: boolean;
        reason?: string;
        remaining?: number;
    };
    /**
     * Check if PR size is within limits
     */
    checkPRSizeLimit(sizeKB: number): {
        allowed: boolean;
        reason?: string;
    };
    /**
     * Record usage for daily limits
     */
    recordUsage(type: "refund" | "deploy" | "message" | "pr" | "merge", amount?: number): void;
    /**
     * Get current daily usage
     */
    private getDailyUsage;
    private getTodayKey;
    private getTomorrowTimestamp;
}
/**
 * Create a limit checker instance
 */
export declare function createLimitChecker(limits: TypedLimits): LimitChecker;
//# sourceMappingURL=limits.d.ts.map