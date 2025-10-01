/**
 * Limits Enforcement for Policy Verification
 *
 * Provides limits checking for policy verification using the robust
 * TypedLimits system from the main functions/utils directory.
 */

import { PassportData } from "../../../types/passport";
import { DecisionReason } from "../../../shared/types/decision";
import { Env } from "../types";
import {
  validateLimits,
  createLimitChecker,
  TypedLimits,
  LimitValidationResult,
} from "../limits";

export async function evaluateLimits(
  env: Env,
  passport: PassportData,
  policyPack: any,
  context: Record<string, any>,
  idempotencyKey?: string
): Promise<{ allow: boolean; reasons: DecisionReason[] }> {
  const reasons: DecisionReason[] = [];

  // Check if policy has limits defined
  if (!policyPack.limits) {
    return { allow: true, reasons };
  }

  // Validate limits using robust utility
  const limitValidation = validateLimits(policyPack.limits);
  if (!limitValidation.valid) {
    reasons.push({
      code: "INVALID_LIMITS",
      message: `Invalid limits configuration: ${limitValidation.errors.join(
        ", "
      )}`,
      severity: "error",
    });
    return { allow: false, reasons };
  }

  // Create limit checker using robust utility
  const limitChecker = createLimitChecker(policyPack.limits as TypedLimits);

  // Check specific limits based on context
  if (context.amount_minor) {
    // Check refund limits
    const refundResult = limitChecker.checkRefundLimit(context.amount_minor);
    if (!refundResult.allowed) {
      reasons.push({
        code: "REFUND_LIMIT_EXCEEDED",
        message: refundResult.reason || "Refund limit exceeded",
        severity: "error",
      });
    }
  }

  if (context.row_count) {
    // Check export limits
    const exportResult = limitChecker.checkExportLimit(
      context.row_count,
      context.has_pii || false
    );
    if (!exportResult.allowed) {
      reasons.push({
        code: "EXPORT_LIMIT_EXCEEDED",
        message: exportResult.reason || "Export limit exceeded",
        severity: "error",
      });
    }
  }

  if (context.operation === "deploy") {
    // Check deploy limits
    const deployResult = limitChecker.checkDeployLimit();
    if (!deployResult.allowed) {
      reasons.push({
        code: "DEPLOY_LIMIT_EXCEEDED",
        message: deployResult.reason || "Deploy limit exceeded",
        severity: "error",
      });
    }
  }

  // Check action rate limits
  const actionResult = limitChecker.checkActionRateLimit();
  if (!actionResult.allowed) {
    reasons.push({
      code: "ACTION_RATE_LIMIT_EXCEEDED",
      message: actionResult.reason || "Action rate limit exceeded",
      severity: "error",
    });
  }

  if (reasons.length > 0) {
    return { allow: false, reasons };
  }

  return { allow: true, reasons };
}
