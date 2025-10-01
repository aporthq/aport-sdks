/**
 * Order Management Utilities
 *
 * Centralized utilities for handling order-related operations,
 * balance validation, and order state management.
 */

export interface OrderInfo {
  order_id: string;
  customer_id: string;
  currency: string;
  total_minor: number;
  refunded_minor: number;
  status: "pending" | "paid" | "refunded" | "cancelled";
  created_at: string;
  updated_at: string;
}

export interface RefundInfo {
  refund_id: string;
  order_id: string;
  amount_minor: number;
  currency: string;
  reason_code: string;
  status: "pending" | "processed" | "failed";
  created_at: string;
  idempotency_key: string;
}

/**
 * Validate order balance for refund with atomic checks
 */
export function validateOrderBalance(
  orderTotalMinor: number,
  alreadyRefundedMinor: number,
  refundAmountMinor: number
): { valid: boolean; reason?: string; remainingBalance?: number } {
  // Validate inputs
  if (orderTotalMinor <= 0) {
    return {
      valid: false,
      reason: "Invalid order total amount",
      remainingBalance: 0,
    };
  }

  if (alreadyRefundedMinor < 0) {
    return {
      valid: false,
      reason: "Invalid already refunded amount",
      remainingBalance: 0,
    };
  }

  if (refundAmountMinor <= 0) {
    return {
      valid: false,
      reason: "Refund amount must be positive",
      remainingBalance: 0,
    };
  }

  const remainingBalance = orderTotalMinor - alreadyRefundedMinor;

  if (remainingBalance < 0) {
    return {
      valid: false,
      reason: "Order has been over-refunded",
      remainingBalance: 0,
    };
  }

  if (refundAmountMinor > remainingBalance) {
    return {
      valid: false,
      reason: `Refund amount ${refundAmountMinor} exceeds remaining order balance ${remainingBalance}`,
      remainingBalance,
    };
  }

  // Additional safety check: ensure we don't exceed reasonable limits
  if (refundAmountMinor > orderTotalMinor) {
    return {
      valid: false,
      reason: "Refund amount cannot exceed original order total",
      remainingBalance,
    };
  }

  return {
    valid: true,
    remainingBalance: remainingBalance - refundAmountMinor,
  };
}

/**
 * Validate refund reason code
 */
export function validateReasonCode(
  reasonCode: string,
  allowedReasonCodes: string[]
): { valid: boolean; reason?: string } {
  if (allowedReasonCodes.length === 0) {
    return { valid: true }; // No restrictions
  }

  if (!allowedReasonCodes.includes(reasonCode)) {
    return {
      valid: false,
      reason: `Invalid reason code '${reasonCode}'. Allowed: ${allowedReasonCodes.join(
        ", "
      )}`,
    };
  }

  return { valid: true };
}

/**
 * Validate idempotency key format
 */
export function validateIdempotencyKey(idempotencyKey: string): {
  valid: boolean;
  reason?: string;
} {
  if (!idempotencyKey) {
    return { valid: false, reason: "Idempotency key is required" };
  }

  if (idempotencyKey.length < 10) {
    return {
      valid: false,
      reason: "Idempotency key must be at least 10 characters",
    };
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(idempotencyKey)) {
    return {
      valid: false,
      reason: "Idempotency key contains invalid characters",
    };
  }

  return { valid: true };
}

/**
 * Generate idempotency key
 */
export function generateIdempotencyKey(prefix: string = "refund"): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Validate order ID format
 */
export function validateOrderId(orderId: string): {
  valid: boolean;
  reason?: string;
} {
  if (!orderId) {
    return { valid: false, reason: "Order ID is required" };
  }

  if (orderId.length < 3) {
    return { valid: false, reason: "Order ID must be at least 3 characters" };
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(orderId)) {
    return { valid: false, reason: "Order ID contains invalid characters" };
  }

  return { valid: true };
}

/**
 * Validate customer ID format
 */
export function validateCustomerId(customerId: string): {
  valid: boolean;
  reason?: string;
} {
  if (!customerId) {
    return { valid: false, reason: "Customer ID is required" };
  }

  if (customerId.length < 3) {
    return {
      valid: false,
      reason: "Customer ID must be at least 3 characters",
    };
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(customerId)) {
    return { valid: false, reason: "Customer ID contains invalid characters" };
  }

  return { valid: true };
}

/**
 * Check if currencies match (for cross-currency validation)
 */
export function validateCurrencyMatch(
  orderCurrency: string,
  refundCurrency: string
): { valid: boolean; reason?: string } {
  if (orderCurrency && refundCurrency && orderCurrency !== refundCurrency) {
    return {
      valid: false,
      reason: `Cross-currency refunds not supported in v1. Order currency: ${orderCurrency}, Refund currency: ${refundCurrency}`,
    };
  }

  return { valid: true };
}

/**
 * Calculate remaining order balance
 */
export function calculateRemainingBalance(
  orderTotalMinor: number,
  alreadyRefundedMinor: number
): number {
  return Math.max(0, orderTotalMinor - alreadyRefundedMinor);
}

/**
 * Check if order can be refunded
 */
export function canRefundOrder(orderInfo: OrderInfo): {
  allowed: boolean;
  reason?: string;
} {
  if (orderInfo.status === "cancelled") {
    return { allowed: false, reason: "Cannot refund cancelled order" };
  }

  if (orderInfo.status === "pending") {
    return { allowed: false, reason: "Cannot refund pending order" };
  }

  if (orderInfo.refunded_minor >= orderInfo.total_minor) {
    return { allowed: false, reason: "Order has been fully refunded" };
  }

  return { allowed: true };
}

/**
 * Format order ID for display
 */
export function formatOrderId(orderId: string): string {
  return `Order ${orderId}`;
}

/**
 * Format customer ID for display
 */
export function formatCustomerId(customerId: string): string {
  return `Customer ${customerId}`;
}
