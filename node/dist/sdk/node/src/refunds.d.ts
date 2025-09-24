/**
 * Refunds v1 Policy Helper Functions
 *
 * Provides easy-to-use functions for refunds.v1 policy enforcement
 * with proper TypeScript types and error handling.
 */
import { PolicyEnforcementConfig } from "./policy-enforcement";
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
        reasons?: Array<{
            code: string;
            message: string;
        }>;
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
export declare function validateRefundContext(context: Partial<RefundContext>): {
    valid: boolean;
    errors: string[];
    warnings?: string[];
    suspicious?: boolean;
    suspiciousReasons?: string[];
};
/**
 * Process a refund request with refunds.v1 policy enforcement
 *
 * @param context - Refund context data
 * @param config - Policy configuration
 * @returns Refund result with decision details
 */
export declare function processRefund(context: RefundContext, config: RefundPolicyConfig): Promise<RefundResult>;
/**
 * Check if a refund is allowed without processing
 *
 * @param context - Refund context data
 * @param config - Policy configuration
 * @returns Boolean indicating if refund is allowed
 */
export declare function isRefundAllowed(context: RefundContext, config: RefundPolicyConfig): Promise<boolean>;
/**
 * Get refund policy information
 *
 * @param config - Policy configuration
 * @returns Policy pack information
 */
export declare function getRefundPolicy(config: RefundPolicyConfig): Promise<any>;
/**
 * Create a refund context from request data
 *
 * @param requestData - Raw request data (from Express req.body, FastAPI request, etc.)
 * @param headers - Request headers (optional)
 * @returns Validated refund context
 */
export declare function createRefundContext(requestData: any, headers?: Record<string, string>): RefundContext;
/**
 * Refunds v1 policy constants
 */
export declare const REFUNDS_V1: {
    readonly POLICY_ID: "refunds.v1";
    readonly REQUIRED_FIELDS: readonly ["order_id", "customer_id", "amount_minor", "currency", "region", "reason_code", "idempotency_key"];
    readonly OPTIONAL_FIELDS: readonly ["order_currency", "order_total_minor", "already_refunded_minor", "note", "merchant_case_id"];
    readonly REASON_CODES: readonly ["customer_request", "defective", "not_as_described", "duplicate", "fraud", "cancelled", "returned"];
};
//# sourceMappingURL=refunds.d.ts.map