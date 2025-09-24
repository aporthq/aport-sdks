"use strict";
/**
 * Refunds v1 Policy Helper Functions
 *
 * Provides easy-to-use functions for refunds.v1 policy enforcement
 * with proper TypeScript types and error handling.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.REFUNDS_V1 = void 0;
exports.validateRefundContext = validateRefundContext;
exports.processRefund = processRefund;
exports.isRefundAllowed = isRefundAllowed;
exports.getRefundPolicy = getRefundPolicy;
exports.createRefundContext = createRefundContext;
const policy_enforcement_1 = require("./policy-enforcement");
const security_1 = require("./security");
/**
 * Validate refund context for required fields
 */
function validateRefundContext(context) {
    // Use enhanced security validation
    const securityResult = (0, security_1.validateFinancialInput)(context);
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
        if (!context[field]) {
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
async function processRefund(context, config) {
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
        const result = await (0, policy_enforcement_1.verifyPolicy)(config.agentId, "refunds.v1", context, {
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
                    reasons: result.error?.violations?.map((v) => ({
                        code: "policy_violation",
                        message: v,
                    })) || [],
                },
            };
        }
        // Generate cryptographically secure refund ID
        const refund_id = (0, security_1.generateSecureId)("ref");
        return {
            allowed: true,
            refund_id,
            decision_id: result.result?.evaluation?.decision_id,
            remaining_daily_cap: result.result?.evaluation?.remaining_daily_cap,
            expires_in: result.result?.evaluation?.expires_in,
        };
    }
    catch (error) {
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
async function isRefundAllowed(context, config) {
    const result = await processRefund(context, config);
    return result.allowed;
}
/**
 * Get refund policy information
 *
 * @param config - Policy configuration
 * @returns Policy pack information
 */
async function getRefundPolicy(config) {
    const { verifyPolicy } = await Promise.resolve().then(() => __importStar(require("./policy-enforcement")));
    const { getPolicy } = await Promise.resolve().then(() => __importStar(require("./policy-enforcement")));
    return await getPolicy("refunds.v1", config);
}
/**
 * Create a refund context from request data
 *
 * @param requestData - Raw request data (from Express req.body, FastAPI request, etc.)
 * @param headers - Request headers (optional)
 * @returns Validated refund context
 */
function createRefundContext(requestData, headers = {}) {
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
exports.REFUNDS_V1 = {
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
};
//# sourceMappingURL=refunds.js.map