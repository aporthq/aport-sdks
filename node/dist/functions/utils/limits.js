"use strict";
/**
 * Typed Limits Schema and Validation
 *
 * This module provides a strongly-typed limits system with validation,
 * enforcement, and performance optimizations for edge computing.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LimitChecker = exports.LIMIT_METADATA = void 0;
exports.validateLimitValue = validateLimitValue;
exports.validateLimits = validateLimits;
exports.getLimitsForCapability = getLimitsForCapability;
exports.getLimitsByCategory = getLimitsByCategory;
exports.isLimitEnforcedForCapability = isLimitEnforcedForCapability;
exports.getLimitEnforcementRules = getLimitEnforcementRules;
exports.createLimitChecker = createLimitChecker;
/**
 * Complete registry of all valid limits with metadata
 */
exports.LIMIT_METADATA = {
    refund_amount_max_per_tx: {
        key: "refund_amount_max_per_tx",
        type: "number",
        min: 0,
        max: 1000000, // $10,000 max per transaction
        description: "Maximum refund amount per transaction in USD cents (legacy)",
        category: "payments",
        relatedCapabilities: ["payments.refund"],
        validationRules: [
            "Must be non-negative",
            "Must be <= refund_amount_daily_cap if both are set",
        ],
    },
    refund_amount_daily_cap: {
        key: "refund_amount_daily_cap",
        type: "number",
        min: 0,
        max: 10000000, // $100,000 max daily
        description: "Maximum total refunds per day in USD cents (legacy)",
        category: "payments",
        relatedCapabilities: ["payments.refund"],
        validationRules: [
            "Must be non-negative",
            "Must be >= refund_amount_max_per_tx if both are set",
        ],
    },
    supported_currencies: {
        key: "supported_currencies",
        type: "string[]",
        description: "List of supported currencies for refunds (e.g., ['USD', 'EUR', 'GBP'])",
        category: "payments",
        relatedCapabilities: ["payments.refund"],
        validationRules: [
            "Must be array of valid ISO currency codes",
            "Must include at least one currency",
        ],
    },
    currency_limits: {
        key: "currency_limits",
        type: "object",
        description: "Per-currency limits for refunds",
        category: "payments",
        relatedCapabilities: ["payments.refund"],
        validationRules: [
            "Must be object with currency codes as keys",
            "Each currency must have max_per_tx and daily_cap",
            "Values must be in currency's smallest unit",
        ],
    },
    refund_reason_codes: {
        key: "refund_reason_codes",
        type: "string[]",
        description: "Allowed reason codes for refunds (e.g., ['defective', 'not_as_described'])",
        category: "payments",
        relatedCapabilities: ["payments.refund"],
        validationRules: [
            "Must be array of valid reason codes",
            "Must include at least one reason code",
        ],
    },
    payout_usd_daily_cap: {
        key: "payout_usd_daily_cap",
        type: "number",
        min: 0,
        max: 100000000, // $1M max daily
        description: "Maximum total payouts per day in USD cents",
        category: "payments",
        relatedCapabilities: ["payments.payout"],
        validationRules: ["Must be non-negative"],
    },
    max_actions_per_min: {
        key: "max_actions_per_min",
        type: "number",
        min: 1,
        max: 10000,
        description: "Maximum actions allowed per minute",
        category: "actions",
        relatedCapabilities: ["*"], // Applies to all capabilities
        validationRules: ["Must be positive integer"],
    },
    max_export_rows: {
        key: "max_export_rows",
        type: "number",
        min: 1,
        max: 1000000,
        description: "Maximum number of rows in data exports",
        category: "data",
        relatedCapabilities: ["data.export"],
        validationRules: ["Must be positive integer"],
    },
    allow_pii: {
        key: "allow_pii",
        type: "boolean",
        description: "Whether PII (Personally Identifiable Information) access is allowed",
        category: "privacy",
        relatedCapabilities: ["data.export", "data.delete", "crm.update"],
        validationRules: ["Must be boolean"],
    },
    max_deploys_per_day: {
        key: "max_deploys_per_day",
        type: "number",
        min: 0,
        max: 100,
        description: "Maximum deployments allowed per day",
        category: "deployment",
        relatedCapabilities: ["infra.deploy"],
        validationRules: ["Must be non-negative integer"],
    },
    msgs_per_min: {
        key: "msgs_per_min",
        type: "number",
        min: 1,
        max: 1000,
        description: "Maximum messages allowed per minute",
        category: "messaging",
        relatedCapabilities: ["messaging.send"],
        validationRules: ["Must be positive integer"],
    },
    msgs_per_day: {
        key: "msgs_per_day",
        type: "number",
        min: 1,
        max: 50000,
        description: "Maximum messages allowed per day",
        category: "messaging",
        relatedCapabilities: ["messaging.send"],
        validationRules: [
            "Must be positive integer",
            "Should be >= msgs_per_min * 60 * 24 if both are set",
        ],
    },
    max_prs_per_day: {
        key: "max_prs_per_day",
        type: "number",
        min: 1,
        max: 100,
        description: "Maximum pull requests allowed per day",
        category: "repository",
        relatedCapabilities: ["repo.pr.create"],
        validationRules: ["Must be positive integer"],
    },
    max_merges_per_day: {
        key: "max_merges_per_day",
        type: "number",
        min: 1,
        max: 100,
        description: "Maximum merges allowed per day",
        category: "repository",
        relatedCapabilities: ["repo.merge"],
        validationRules: ["Must be positive integer"],
    },
    max_pr_size_kb: {
        key: "max_pr_size_kb",
        type: "number",
        min: 1,
        max: 10240, // 10MB max
        description: "Maximum pull request size in kilobytes",
        category: "repository",
        relatedCapabilities: ["repo.merge"],
        validationRules: ["Must be positive integer"],
    },
    allowed_repos: {
        key: "allowed_repos",
        type: "string[]",
        description: "Allowed repositories",
        category: "repository",
        relatedCapabilities: ["repo.pr.create", "repo.merge"],
        validationRules: ["Must be array of strings"],
    },
    allowed_base_branches: {
        key: "allowed_base_branches",
        type: "string[]",
        description: "Allowed base branches",
        category: "repository",
        relatedCapabilities: ["repo.pr.create", "repo.merge"],
        validationRules: ["Must be array of strings"],
    },
    allowed_paths: {
        key: "allowed_paths",
        type: "string[]",
        description: "Allowed paths",
        category: "repository",
        relatedCapabilities: ["repo.pr.create", "repo.merge"],
        validationRules: ["Must be array of strings"],
    },
    requires_review: {
        key: "requires_review",
        type: "boolean",
        description: "Requires review",
        category: "repository",
        relatedCapabilities: ["repo.pr.create", "repo.merge"],
        validationRules: ["Must be boolean"],
    },
};
/**
 * Validate a single limit value
 */
function validateLimitValue(key, value) {
    const metadata = exports.LIMIT_METADATA[key];
    const errors = [];
    const warnings = [];
    // Type validation
    if (metadata.type === "number" && typeof value !== "number") {
        errors.push(`${key} must be a number, got ${typeof value}`);
        return { valid: false, errors, warnings };
    }
    if (metadata.type === "boolean" && typeof value !== "boolean") {
        errors.push(`${key} must be a boolean, got ${typeof value}`);
        return { valid: false, errors, warnings };
    }
    // Range validation for numbers
    if (metadata.type === "number" && typeof value === "number") {
        if (metadata.min !== undefined && value < metadata.min) {
            errors.push(`${key} must be >= ${metadata.min}, got ${value}`);
        }
        if (metadata.max !== undefined && value > metadata.max) {
            errors.push(`${key} must be <= ${metadata.max}, got ${value}`);
        }
    }
    return { valid: errors.length === 0, errors, warnings };
}
/**
 * Validate a complete limits object
 */
function validateLimits(limits) {
    const errors = [];
    const warnings = [];
    // Check for unknown keys
    const validKeys = Object.keys(exports.LIMIT_METADATA);
    const providedKeys = Object.keys(limits);
    const unknownKeys = providedKeys.filter((key) => !validKeys.includes(key));
    if (unknownKeys.length > 0) {
        errors.push(`Unknown limit keys: ${unknownKeys.join(", ")}. Valid keys: ${validKeys.join(", ")}`);
    }
    // Validate each provided limit
    for (const [key, value] of Object.entries(limits)) {
        if (validKeys.includes(key)) {
            const result = validateLimitValue(key, value);
            errors.push(...result.errors);
            warnings.push(...result.warnings);
        }
    }
    // Cross-validation rules
    if (limits.refund_amount_max_per_tx && limits.refund_amount_daily_cap) {
        if (limits.refund_amount_max_per_tx > limits.refund_amount_daily_cap) {
            errors.push("refund_amount_max_per_tx cannot exceed refund_amount_daily_cap");
        }
    }
    // Messaging rate validation
    if (limits.msgs_per_min && limits.msgs_per_day) {
        const theoreticalDailyMax = limits.msgs_per_min * 60 * 24;
        if (limits.msgs_per_day < limits.msgs_per_min) {
            errors.push("msgs_per_day should be at least msgs_per_min");
        }
        if (limits.msgs_per_day > theoreticalDailyMax) {
            warnings.push(`msgs_per_day (${limits.msgs_per_day}) exceeds theoretical maximum based on msgs_per_min (${theoreticalDailyMax})`);
        }
    }
    return { valid: errors.length === 0, errors, warnings };
}
/**
 * Get limits related to a specific capability
 */
function getLimitsForCapability(capabilityId) {
    const relatedLimits = [];
    for (const [key, metadata] of Object.entries(exports.LIMIT_METADATA)) {
        if (metadata.relatedCapabilities.includes("*") ||
            metadata.relatedCapabilities.includes(capabilityId)) {
            relatedLimits.push(key);
        }
    }
    return relatedLimits;
}
/**
 * Get all limits by category
 */
function getLimitsByCategory(category) {
    return Object.entries(exports.LIMIT_METADATA)
        .filter(([_, metadata]) => metadata.category === category)
        .map(([key, _]) => key);
}
/**
 * Check if a limit is enforced for a capability
 */
function isLimitEnforcedForCapability(limitKey, capabilityId) {
    const metadata = exports.LIMIT_METADATA[limitKey];
    return (metadata.relatedCapabilities.includes("*") ||
        metadata.relatedCapabilities.includes(capabilityId));
}
/**
 * Get limit enforcement rules for documentation
 */
function getLimitEnforcementRules(limitKey) {
    const metadata = exports.LIMIT_METADATA[limitKey];
    return metadata.validationRules;
}
/**
 * OPTIMIZED: Fast limit checking for edge performance
 * Pre-validates limits and creates optimized checkers
 */
class LimitChecker {
    constructor(limits) {
        this.dailyCounters = new Map();
        this.limits = limits;
    }
    /**
     * Check if a refund amount is within limits
     */
    checkRefundLimit(amountCents) {
        const perTxLimit = this.limits.refund_amount_max_per_tx;
        const dailyLimit = this.limits.refund_amount_daily_cap;
        if (perTxLimit !== undefined && amountCents > perTxLimit) {
            return {
                allowed: false,
                reason: `Refund amount ${amountCents} exceeds per-transaction limit ${perTxLimit}`,
            };
        }
        if (dailyLimit !== undefined) {
            const dailyUsage = this.getDailyUsage("refund");
            if (dailyUsage + amountCents > dailyLimit) {
                return {
                    allowed: false,
                    reason: `Refund would exceed daily limit ${dailyLimit} (current usage: ${dailyUsage})`,
                };
            }
        }
        return { allowed: true };
    }
    /**
     * Check if an export is within row limits
     */
    checkExportLimit(rowCount, hasPII = false) {
        const maxRows = this.limits.max_export_rows;
        const allowPII = this.limits.allow_pii;
        if (maxRows !== undefined && rowCount > maxRows) {
            return {
                allowed: false,
                reason: `Export row count ${rowCount} exceeds limit ${maxRows}`,
            };
        }
        if (hasPII && allowPII === false) {
            return {
                allowed: false,
                reason: "PII access not allowed (allow_pii is false)",
            };
        }
        return { allowed: true };
    }
    /**
     * Check if a deployment is within daily limits
     */
    checkDeployLimit() {
        const maxDeploys = this.limits.max_deploys_per_day;
        if (maxDeploys === undefined) {
            return { allowed: true };
        }
        const dailyUsage = this.getDailyUsage("deploy");
        const remaining = maxDeploys - dailyUsage;
        if (dailyUsage >= maxDeploys) {
            return {
                allowed: false,
                reason: `Daily deploy limit ${maxDeploys} exceeded (used: ${dailyUsage})`,
                remaining: 0,
            };
        }
        return { allowed: true, remaining };
    }
    /**
     * Check action rate limit
     */
    checkActionRateLimit() {
        const maxActions = this.limits.max_actions_per_min;
        if (maxActions === undefined) {
            return { allowed: true };
        }
        // This would integrate with your rate limiting system
        // For now, return allowed - implement with actual rate limiter
        return { allowed: true };
    }
    /**
     * Check if messaging is within rate limits
     */
    checkMessagingLimit() {
        const perMinLimit = this.limits.msgs_per_min;
        const dailyLimit = this.limits.msgs_per_day;
        // Check per-minute rate limit (would integrate with actual rate limiter)
        if (perMinLimit !== undefined) {
            // This would check against actual rate limiter
            // For now, return allowed - implement with Redis/memory rate limiter
        }
        if (dailyLimit !== undefined) {
            const dailyUsage = this.getDailyUsage("message");
            if (dailyUsage >= dailyLimit) {
                return {
                    allowed: false,
                    reason: `Daily message limit ${dailyLimit} exceeded (used: ${dailyUsage})`,
                };
            }
        }
        return { allowed: true };
    }
    /**
     * Check if PR creation is within limits
     */
    checkPRLimit() {
        const maxPRs = this.limits.max_prs_per_day;
        if (maxPRs === undefined) {
            return { allowed: true };
        }
        const dailyUsage = this.getDailyUsage("pr");
        const remaining = maxPRs - dailyUsage;
        if (dailyUsage >= maxPRs) {
            return {
                allowed: false,
                reason: `Daily PR limit ${maxPRs} exceeded (used: ${dailyUsage})`,
                remaining: 0,
            };
        }
        return { allowed: true, remaining };
    }
    /**
     * Check if merge is within limits
     */
    checkMergeLimit() {
        const maxMerges = this.limits.max_merges_per_day;
        if (maxMerges === undefined) {
            return { allowed: true };
        }
        const dailyUsage = this.getDailyUsage("merge");
        const remaining = maxMerges - dailyUsage;
        if (dailyUsage >= maxMerges) {
            return {
                allowed: false,
                reason: `Daily merge limit ${maxMerges} exceeded (used: ${dailyUsage})`,
                remaining: 0,
            };
        }
        return { allowed: true, remaining };
    }
    /**
     * Check if PR size is within limits
     */
    checkPRSizeLimit(sizeKB) {
        const maxSizeKB = this.limits.max_pr_size_kb;
        if (maxSizeKB === undefined) {
            return { allowed: true };
        }
        if (sizeKB > maxSizeKB) {
            return {
                allowed: false,
                reason: `PR size ${sizeKB}KB exceeds limit ${maxSizeKB}KB`,
            };
        }
        return { allowed: true };
    }
    /**
     * Record usage for daily limits
     */
    recordUsage(type, amount = 1) {
        const key = `${type}_${this.getTodayKey()}`;
        const current = this.dailyCounters.get(key) || {
            count: 0,
            resetTime: this.getTomorrowTimestamp(),
        };
        current.count += amount;
        this.dailyCounters.set(key, current);
    }
    /**
     * Get current daily usage
     */
    getDailyUsage(type) {
        const key = `${type}_${this.getTodayKey()}`;
        const current = this.dailyCounters.get(key);
        if (!current || Date.now() > current.resetTime) {
            return 0;
        }
        return current.count;
    }
    getTodayKey() {
        return new Date().toISOString().split("T")[0];
    }
    getTomorrowTimestamp() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        return tomorrow.getTime();
    }
}
exports.LimitChecker = LimitChecker;
/**
 * Create a limit checker instance
 */
function createLimitChecker(limits) {
    return new LimitChecker(limits);
}
//# sourceMappingURL=limits.js.map