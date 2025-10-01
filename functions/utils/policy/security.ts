/**
 * Security utilities for policy verification
 *
 * Provides security validation for policy verification using the robust
 * security utilities from the main functions/utils directory.
 */

import {
  sanitizeInput as sanitizeInputUtil,
  validateTokenFormat,
  isSuspiciousRequest,
  generateSecureRandom,
} from "../security";

export interface SecurityValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suspicious: boolean;
  suspiciousReasons: string[];
}

export function sanitizeInput(input: any): any {
  // Use robust sanitization from main security utility
  return sanitizeInputUtil(input);
}

export function detectSuspiciousActivity(context: any): {
  suspicious: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  // Check for suspicious patterns
  if (context.amount_minor > 1000000) {
    // $10,000
    reasons.push("High-value refund request");
  }

  // Check for round numbers (potential test attacks)
  if (context.amount_minor % 10000 === 0 && context.amount_minor > 100000) {
    reasons.push("Suspicious round number amount");
  }

  // Check for suspicious order IDs
  if (context.order_id && /^(test|demo|fake)/i.test(context.order_id)) {
    reasons.push("Suspicious order ID pattern");
  }

  // Check for suspicious customer IDs
  if (context.customer_id && /^(test|demo|fake)/i.test(context.customer_id)) {
    reasons.push("Suspicious customer ID pattern");
  }

  // Check for duplicate idempotency keys (would need external tracking)
  // This is a placeholder - in production, you'd check against a database

  return {
    suspicious: reasons.length > 0,
    reasons,
  };
}

export function validateFinancialInput(context: any): SecurityValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Sanitize all inputs first
  let sanitizedContext: any;
  try {
    sanitizedContext = sanitizeInput(context);
  } catch (error) {
    errors.push("Invalid input data detected");
    return {
      valid: false,
      errors,
      warnings: [],
      suspicious: true,
      suspiciousReasons: ["Malicious input detected"],
    };
  }

  // Validate amount
  if (sanitizedContext.amount_minor !== undefined) {
    if (sanitizedContext.amount_minor <= 0) {
      errors.push("amount_minor must be positive");
    }
    if (sanitizedContext.amount_minor > Number.MAX_SAFE_INTEGER) {
      errors.push("amount_minor exceeds maximum safe integer");
    }
    if (!Number.isInteger(sanitizedContext.amount_minor)) {
      errors.push("amount_minor must be an integer (minor units)");
    }
    if (sanitizedContext.amount_minor > 10000000) {
      // $100,000
      warnings.push("Very high refund amount - manual review recommended");
    }
  }

  // Validate currency format - must be 3 letters (ISO 4217 standard)
  if (sanitizedContext.currency) {
    if (!/^[A-Z]{3}$/.test(sanitizedContext.currency)) {
      errors.push("currency must be a 3-letter ISO 4217 code");
    }
    // Additional validation: check if it's a reasonable currency code
    if (
      sanitizedContext.currency.length !== 3 ||
      !/^[A-Z]+$/.test(sanitizedContext.currency)
    ) {
      errors.push("currency must be exactly 3 uppercase letters");
    }
  }

  // Validate idempotency key format
  if (
    sanitizedContext.idempotency_key &&
    !/^[a-zA-Z0-9_-]{10,64}$/.test(sanitizedContext.idempotency_key)
  ) {
    errors.push(
      "idempotency_key must be 10-64 characters, alphanumeric with hyphens/underscores"
    );
  }

  // Validate order ID format
  if (sanitizedContext.order_id) {
    if (sanitizedContext.order_id.length > 100) {
      errors.push("order_id must be 100 characters or less");
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(sanitizedContext.order_id)) {
      errors.push(
        "order_id must contain only alphanumeric characters, hyphens, and underscores"
      );
    }
  }

  // Validate customer ID format
  if (sanitizedContext.customer_id) {
    if (sanitizedContext.customer_id.length > 100) {
      errors.push("customer_id must be 100 characters or less");
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(sanitizedContext.customer_id)) {
      errors.push(
        "customer_id must contain only alphanumeric characters, hyphens, and underscores"
      );
    }
  }

  // Validate region format - flexible for any country/region code
  if (sanitizedContext.region) {
    // Allow 2-4 character region codes (ISO 3166-1 alpha-2, alpha-3, or custom codes)
    if (!/^[A-Z]{2,4}$/.test(sanitizedContext.region)) {
      errors.push("region must be a 2-4 letter country/region code");
    }
    // Additional validation: check for reasonable region codes
    if (
      sanitizedContext.region.length < 2 ||
      sanitizedContext.region.length > 4
    ) {
      errors.push("region must be 2-4 characters long");
    }
  }

  // Validate reason code
  if (
    sanitizedContext.reason_code &&
    sanitizedContext.reason_code.length > 50
  ) {
    errors.push("reason_code must be 50 characters or less");
  }

  // Check for suspicious activity
  const suspiciousCheck = detectSuspiciousActivity(sanitizedContext);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suspicious: suspiciousCheck.suspicious,
    suspiciousReasons: suspiciousCheck.reasons,
  };
}

export function generateSecureId(prefix: string = "ref"): string {
  const timestamp = Date.now();
  const randomString = generateSecureRandom(16);
  return `${prefix}_${timestamp}_${randomString}`;
}

export function validateAmountPrecision(
  amount: number,
  currency: string
): boolean {
  // For any currency, amount must be an integer (minor units)
  // The actual decimal places are determined by the currency's standard
  // but we work in minor units, so amount should always be an integer
  return Number.isInteger(amount) && amount > 0;
}

export function getCurrencyDecimals(currency: string): number {
  // Common currencies with their decimal places
  // This is for display purposes only - we always work in minor units
  const currencyDecimals: Record<string, number> = {
    KWD: 3,
    BHD: 3,
    OMR: 3,
    JOD: 3,
    TND: 3,
    JPY: 0,
    KRW: 0,
    VND: 0,
    IDR: 0,
    TWD: 0,
    HKD: 2,
    NZD: 2,
    ISK: 0,
    CLP: 0,
    COP: 0,
    ARS: 2,
    UYU: 2,
    PEN: 2,
    BOB: 2,
    PYG: 0,
    VES: 2,
    CRC: 2,
    GTQ: 2,
    HNL: 2,
    NIO: 2,
    PAB: 2,
    DOP: 2,
    JMD: 2,
    TTD: 2,
    BBD: 2,
    BZD: 2,
    XCD: 2,
    AWG: 2,
    ANG: 2,
    SRD: 2,
    GYD: 2,
    BMD: 2,
    KYD: 2,
    FKP: 2,
    SHP: 2,
    SBD: 2,
    VUV: 0,
    WST: 2,
    TOP: 2,
    FJD: 2,
    PGK: 2,
  };
  return currencyDecimals[currency.toUpperCase()] ?? 2; // Default to 2 decimal places
}
