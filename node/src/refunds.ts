/**
 * Refunds v1 Policy Helper Functions
 *
 * Provides easy-to-use functions for refunds.v1 policy enforcement
 * with proper TypeScript types and error handling.
 */

import { verifyPolicy, PolicyEnforcementConfig } from "./policy-enforcement";
import { validateFinancialInput, generateSecureId } from "./security";

// Refunds-specific types
export interface RefundContext {
  order_id: string;
  customer_id: string;
  amount_minor: number;
  currency: string;
  region: string;
  reason_code: string;
  idempotency_key: string;
  order_currency?: string;
  order_total_minor?: number;
  already_refunded_minor?: number;
  note?: string;
  merchant_case_id?: string;
}

export interface RefundResult {
  allowed: boolean;
  refund_id?: string;
  decision_id?: string;
  remaining_daily_cap?: Record<string, number>;
  expires_in?: number;
  error?: {
    code: string;
    message: string;
    reasons?: Array<{ code: string; message: string }>;
  };
}

export interface RefundPolicyConfig extends Partial<PolicyEnforcementConfig> {
  agentId: string;
  failClosed?: boolean;
  logViolations?: boolean;
}

/**
 * Validate refund context for required fields
 */
export function validateRefundContext(context: Partial<RefundContext>): {
  valid: boolean;
  errors: string[];
  warnings?: string[];
  suspicious?: boolean;
  suspiciousReasons?: string[];
} {
  // Use enhanced security validation
  const securityResult = validateFinancialInput(context);

  // Check required fields
  const required = [
    "order_id",
    "customer_id",
    "amount_minor",
    "currency",
    "region",
    "reason_code",
    "idempotency_key",
  ];

  for (const field of required) {
    if (!context[field as keyof RefundContext]) {
      securityResult.errors.push(`${field} is required`);
    }
  }

  return {
    valid: securityResult.valid && securityResult.errors.length === 0,
    errors: securityResult.errors,
    warnings: securityResult.warnings,
    suspicious: securityResult.suspicious,
    suspiciousReasons: securityResult.suspiciousReasons,
  };
}

/**
 * Process a refund request with refunds.v1 policy enforcement
 *
 * @param context - Refund context data
 * @param config - Policy configuration
 * @returns Refund result with decision details
 */
export async function processRefund(
  context: RefundContext,
  config: RefundPolicyConfig
): Promise<RefundResult> {
  // Validate context
  const validation = validateRefundContext(context);
  if (!validation.valid) {
    return {
      allowed: false,
      error: {
        code: "invalid_context",
        message: "Invalid refund context",
        reasons: validation.errors.map((error) => ({
          code: "validation_error",
          message: error,
        })),
      },
    };
  }

  try {
    // Verify policy compliance
    const result = await verifyPolicy(config.agentId, "refunds.v1", context, {
      failClosed: config.failClosed ?? true,
      logViolations: config.logViolations ?? true,
      cacheTtl: config.cacheTtl ?? 60,
      ...config,
    });

    if (!result.allowed) {
      return {
        allowed: false,
        error: {
          code: result.error?.code || "refund_policy_violation",
          message: result.error?.message || "Refund request violates policy",
          reasons:
            result.error?.violations?.map((v) => ({
              code: "policy_violation",
              message: v,
            })) || [],
        },
      };
    }

    // Generate cryptographically secure refund ID
    const refund_id = generateSecureId("ref");

    return {
      allowed: true,
      refund_id,
      decision_id: result.result?.evaluation?.decision_id,
      remaining_daily_cap: result.result?.evaluation?.remaining_daily_cap,
      expires_in: result.result?.evaluation?.expires_in,
    };
  } catch (error) {
    console.error("Refund processing error:", error);

    return {
      allowed: false,
      error: {
        code: "refund_processing_error",
        message: "Failed to process refund request",
      },
    };
  }
}

/**
 * Check if a refund is allowed without processing
 *
 * @param context - Refund context data
 * @param config - Policy configuration
 * @returns Boolean indicating if refund is allowed
 */
export async function isRefundAllowed(
  context: RefundContext,
  config: RefundPolicyConfig
): Promise<boolean> {
  const result = await processRefund(context, config);
  return result.allowed;
}

/**
 * Get refund policy information
 *
 * @param config - Policy configuration
 * @returns Policy pack information
 */
export async function getRefundPolicy(
  config: RefundPolicyConfig
): Promise<any> {
  const { verifyPolicy } = await import("./policy-enforcement");
  const { getPolicy } = await import("./policy-enforcement");

  return await getPolicy("refunds.v1", config);
}

/**
 * Create a refund context from request data
 *
 * @param requestData - Raw request data (from Express req.body, FastAPI request, etc.)
 * @param headers - Request headers (optional)
 * @returns Validated refund context
 */
export function createRefundContext(
  requestData: any,
  headers: Record<string, string> = {}
): RefundContext {
  return {
    order_id: requestData.order_id,
    customer_id: requestData.customer_id,
    amount_minor: requestData.amount_minor,
    currency: requestData.currency,
    region: requestData.region || headers["x-region"] || headers["X-Region"],
    reason_code: requestData.reason_code,
    idempotency_key: requestData.idempotency_key,
    order_currency: requestData.order_currency,
    order_total_minor: requestData.order_total_minor,
    already_refunded_minor: requestData.already_refunded_minor,
    note: requestData.note,
    merchant_case_id: requestData.merchant_case_id,
  };
}

/**
 * Refunds v1 policy constants
 */
export const REFUNDS_V1 = {
  POLICY_ID: "refunds.v1",
  REQUIRED_FIELDS: [
    "order_id",
    "customer_id",
    "amount_minor",
    "currency",
    "region",
    "reason_code",
    "idempotency_key",
  ],
  OPTIONAL_FIELDS: [
    "order_currency",
    "order_total_minor",
    "already_refunded_minor",
    "note",
    "merchant_case_id",
  ],
  REASON_CODES: [
    "customer_request",
    "defective",
    "not_as_described",
    "duplicate",
    "fraud",
    "cancelled",
    "returned",
  ],
} as const;
