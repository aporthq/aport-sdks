/**
 * Limits Enforcement SDK for Agent Passport
 *
 * Provides framework-agnostic enforcement of passport limits with performance optimizations
 * for edge computing environments.
 */

import {
  createLimitChecker,
  LimitChecker,
  TypedLimits,
} from "../../../functions/utils/limits";

/**
 * Limits enforcement configuration
 */
export interface LimitsEnforcementConfig {
  enabled: boolean;
  strictMode: boolean; // If true, reject requests that exceed limits
  logViolations: boolean; // Log limit violations for monitoring
  customCheckers?: Record<
    string,
    (limits: TypedLimits, context: any) => { allowed: boolean; reason?: string }
  >;
}

/**
 * Default limits enforcement configuration
 */
const DEFAULT_CONFIG: LimitsEnforcementConfig = {
  enabled: true,
  strictMode: true,
  logViolations: true,
  customCheckers: {},
};

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
export function checkLimits(
  agent: any,
  context: any,
  config: Partial<LimitsEnforcementConfig> = {}
): LimitsEnforcementResult {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  if (!finalConfig.enabled) {
    return {
      allowed: true,
      violations: [],
      limits: {},
    };
  }

  const violations: Array<{
    type: string;
    reason: string;
    limit?: string;
    value?: any;
    maxValue?: any;
  }> = [];

  if (!agent || !agent.limits) {
    if (finalConfig.strictMode) {
      violations.push({
        type: "no_limits_configured",
        reason: "No limits configured for this agent",
      });
    }
    return {
      allowed: !finalConfig.strictMode,
      violations,
      limits: {},
    };
  }

  const limits = agent.limits;
  const limitChecker = createLimitChecker(limits);

  // Check each limit
  for (const [limitKey, limitValue] of Object.entries(limits)) {
    if (limitValue === undefined) {
      continue;
    }

    // Check if there's a custom checker for this limit
    const customCheck = finalConfig.customCheckers?.[limitKey];
    if (customCheck) {
      const result = customCheck(limits, context);
      if (!result.allowed) {
        violations.push({
          type: "custom_limit_violation",
          reason: result.reason || `Custom limit ${limitKey} violated`,
          limit: limitKey,
        });
      }
      continue;
    }

    // Use the built-in limit checker based on limit type
    let checkResult: {
      allowed: boolean;
      reason?: string;
      value?: any;
      maxValue?: any;
    } = { allowed: true };

    switch (limitKey) {
      case "refund_amount_max_per_tx":
      case "refund_amount_daily_cap":
        checkResult = limitChecker.checkRefundLimit(context.amount || 0);
        break;
      case "data_export_max_rows":
      case "allow_pii":
        checkResult = limitChecker.checkExportLimit(
          context.rows || 0,
          context.contains_pii || false
        );
        break;
      case "max_deploys_per_day":
        checkResult = limitChecker.checkDeployLimit();
        break;
      case "max_actions_per_min":
        checkResult = limitChecker.checkActionRateLimit();
        break;
      case "msgs_per_min":
      case "msgs_per_day":
        checkResult = limitChecker.checkMessagingLimit();
        break;
      case "max_prs_per_day":
        checkResult = limitChecker.checkPRLimit();
        break;
      case "max_merges_per_day":
        checkResult = limitChecker.checkMergeLimit();
        break;
      case "max_pr_size_kb":
        checkResult = limitChecker.checkPRSizeLimit(context.pr_size_kb || 0);
        break;
      default:
        // For unknown limits, assume allowed
        checkResult = { allowed: true };
    }

    if (!checkResult.allowed) {
      violations.push({
        type: "limit_exceeded",
        reason: checkResult.reason || `Limit ${limitKey} exceeded`,
        limit: limitKey,
        value: checkResult.value,
        maxValue: checkResult.maxValue,
      });
    }
  }

  return {
    allowed: violations.length === 0,
    violations,
    limits,
  };
}

/**
 * Check if a specific limit is exceeded
 */
export function isLimitExceeded(
  agent: any,
  limitKey: string,
  context: any,
  config: Partial<LimitsEnforcementConfig> = {}
): { allowed: boolean; reason?: string; value?: any; maxValue?: any } {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  if (!finalConfig.enabled) {
    return { allowed: true };
  }

  if (!agent || !agent.limits) {
    return {
      allowed: !finalConfig.strictMode,
      reason: "No limits configured for this agent",
    };
  }

  const limits = agent.limits;
  const limitValue = limits[limitKey];

  if (limitValue === undefined) {
    return {
      allowed: false,
      reason: `Limit ${limitKey} is not configured for this agent`,
    };
  }

  // Check if there's a custom checker for this limit
  const customCheck = finalConfig.customCheckers?.[limitKey];
  if (customCheck) {
    const result = customCheck(limits, context);
    return {
      allowed: result.allowed,
      reason: result.reason,
    };
  }

  // Use the built-in limit checker based on limit type
  const limitChecker = createLimitChecker(limits);

  switch (limitKey) {
    case "refund_amount_max_per_tx":
    case "refund_amount_daily_cap":
      return limitChecker.checkRefundLimit(context.amount || 0);
    case "data_export_max_rows":
    case "allow_pii":
      return limitChecker.checkExportLimit(
        context.rows || 0,
        context.contains_pii || false
      );
    case "max_deploys_per_day":
      return limitChecker.checkDeployLimit();
    case "max_actions_per_min":
      return limitChecker.checkActionRateLimit();
    case "msgs_per_min":
    case "msgs_per_day":
      return limitChecker.checkMessagingLimit();
    case "max_prs_per_day":
      return limitChecker.checkPRLimit();
    case "max_merges_per_day":
      return limitChecker.checkMergeLimit();
    case "max_pr_size_kb":
      return limitChecker.checkPRSizeLimit(context.pr_size_kb || 0);
    default:
      return { allowed: true };
  }
}

/**
 * Get all limits for an agent
 */
export function getAgentLimits(agent: any): Record<string, any> {
  return agent?.limits || {};
}

/**
 * Validate limits configuration
 */
export function validateLimitsConfig(limits: Record<string, any>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  for (const [key, value] of Object.entries(limits)) {
    if (value === undefined || value === null) {
      errors.push(`Limit ${key} is undefined or null`);
      continue;
    }

    if (typeof value === "number" && value < 0) {
      errors.push(`Limit ${key} cannot be negative`);
    }

    if (typeof value === "string" && value.trim() === "") {
      errors.push(`Limit ${key} cannot be empty`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Export types for external use
