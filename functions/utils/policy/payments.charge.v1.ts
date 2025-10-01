/**
 * Payment Charge Policy Evaluator
 *
 * Evaluates charge requests against the payments.charge.v1 policy pack.
 */

import { PassportData } from "../../../types/passport";
import { Decision, DecisionReason } from "../../../shared/types/decision";
import { Env } from "../types";
import { getRequiredAssuranceLevel, meetsAssuranceRequirement } from "../money";
import { meetsMinimumAssurance } from "../assurance";

export async function evaluatePaymentsChargeV1(
  env: Env,
  passport: PassportData,
  context: Record<string, any>,
  idempotencyKey?: string
): Promise<Decision> {
  const decisionId = generateDecisionId();
  const reasons: DecisionReason[] = [];
  let allow = true;

  // 0. Check agent status (suspended agents should not pass)
  if (passport.status === "suspended" || passport.status === "revoked") {
    return {
      decision_id: decisionId,
      allow: false,
      reasons: [
        {
          code: "oap.passport_suspended",
          message: `Agent is ${passport.status} and cannot perform operations`,
          severity: "error",
        },
      ],
      expires_in: 60,
      created_at: new Date().toISOString(),
    };
  }

  // Validate all required fields from payments.charge.v1 policy
  const requiredFields = [
    "amount",
    "currency",
    "merchant_id",
    "region",
    "items",
    "idempotency_key",
  ];

  const missingFields = requiredFields.filter((field) => !context[field]);
  if (missingFields.length > 0) {
    return {
      decision_id: decisionId,
      allow: false,
      reasons: [
        {
          code: "oap.invalid_context",
          message: `Missing required fields: ${missingFields.join(", ")}`,
          severity: "error",
        },
      ],
      expires_in: 60,
      created_at: new Date().toISOString(),
    };
  }

  // 1. Check capabilities
  const hasChargeCapability = passport.capabilities?.some(
    (cap) => cap.id === "payments.charge"
  );
  if (!hasChargeCapability) {
    return {
      decision_id: decisionId,
      allow: false,
      reasons: [
        {
          code: "oap.unknown_capability",
          message: "Agent does not have payments.charge capability",
          severity: "error",
        },
      ],
      expires_in: 60,
      created_at: new Date().toISOString(),
    };
  }

  // 2. Check assurance level
  const requiredAssurance =
    passport.limits?.payments?.charge?.require_assurance_at_least || "L2";
  if (!meetsMinimumAssurance(passport.assurance_level, requiredAssurance)) {
    return {
      decision_id: decisionId,
      allow: false,
      reasons: [
        {
          code: "oap.assurance_insufficient",
          message: `Assurance level ${passport.assurance_level} is insufficient, requires ${requiredAssurance}`,
          severity: "error",
        },
      ],
      expires_in: 60,
      created_at: new Date().toISOString(),
    };
  }

  // 3. Check currency support
  const supportedCurrencies = Object.keys(
    passport.limits?.payments?.charge?.currency_limits || {}
  );
  if (!supportedCurrencies.includes(context.currency)) {
    return {
      decision_id: decisionId,
      allow: false,
      reasons: [
        {
          code: "oap.currency_unsupported",
          message: `Currency ${context.currency} is not supported`,
          severity: "error",
        },
      ],
      expires_in: 60,
      created_at: new Date().toISOString(),
    };
  }

  // 4. Check per-transaction amount limit
  const currencyLimits =
    passport.limits?.payments?.charge?.currency_limits?.[context.currency];
  if (currencyLimits && context.amount > currencyLimits.max_per_tx) {
    return {
      decision_id: decisionId,
      allow: false,
      reasons: [
        {
          code: "oap.limit_exceeded",
          message: `Amount ${context.amount} exceeds per-transaction limit ${currencyLimits.max_per_tx}`,
          severity: "error",
        },
      ],
      expires_in: 60,
      created_at: new Date().toISOString(),
    };
  }

  // 5. Check item count limit
  const maxItems = passport.limits?.payments?.charge?.max_items_per_tx;
  if (maxItems && context.items && context.items.length > maxItems) {
    return {
      decision_id: decisionId,
      allow: false,
      reasons: [
        {
          code: "oap.limit_exceeded",
          message: `Item count ${context.items.length} exceeds maximum allowed ${maxItems}`,
          severity: "error",
        },
      ],
      expires_in: 60,
      created_at: new Date().toISOString(),
    };
  }

  // 6. Check merchant allowlist
  const allowedMerchants =
    passport.limits?.payments?.charge?.allowed_merchant_ids;
  if (
    allowedMerchants &&
    allowedMerchants.length > 0 &&
    !allowedMerchants.includes(context.merchant_id)
  ) {
    return {
      decision_id: decisionId,
      allow: false,
      reasons: [
        {
          code: "oap.merchant_forbidden",
          message: `Merchant ${context.merchant_id} is not in allowlist`,
          severity: "error",
        },
      ],
      expires_in: 60,
      created_at: new Date().toISOString(),
    };
  }

  // 7. Check country allowlist
  const allowedCountries = passport.limits?.payments?.charge?.allowed_countries;
  if (
    allowedCountries &&
    allowedCountries.length > 0 &&
    context.shipping_country &&
    !allowedCountries.includes(context.shipping_country)
  ) {
    return {
      decision_id: decisionId,
      allow: false,
      reasons: [
        {
          code: "oap.region_blocked",
          message: `Shipping country ${context.shipping_country} is not allowed`,
          severity: "error",
        },
      ],
      expires_in: 60,
      created_at: new Date().toISOString(),
    };
  }

  // 8. Check category blocklist
  const blockedCategories =
    passport.limits?.payments?.charge?.blocked_categories;
  if (blockedCategories && blockedCategories.length > 0 && context.items) {
    const blockedItems = context.items.filter(
      (item: any) => item.category && blockedCategories.includes(item.category)
    );
    if (blockedItems.length > 0) {
      return {
        decision_id: decisionId,
        allow: false,
        reasons: [
          {
            code: "oap.category_blocked",
            message: `Items with blocked categories found: ${blockedItems
              .map((item: any) => item.category)
              .join(", ")}`,
            severity: "error",
          },
        ],
        expires_in: 60,
        created_at: new Date().toISOString(),
      };
    }
  }

  // 9. Check daily cap (simplified - in production would check actual daily totals)
  if (currencyLimits && currencyLimits.daily_cap) {
    // This would typically check against a counter service
    // For now, we'll just validate the amount is within daily cap
    if (context.amount > currencyLimits.daily_cap) {
      return {
        decision_id: decisionId,
        allow: false,
        reasons: [
          {
            code: "oap.limit_exceeded",
            message: `Amount ${context.amount} exceeds daily cap ${currencyLimits.daily_cap}`,
            severity: "error",
          },
        ],
        expires_in: 60,
        created_at: new Date().toISOString(),
      };
    }
  }

  // 10. Check idempotency (simplified - in production would check against a cache)
  if (
    passport.limits?.payments?.charge?.idempotency_required &&
    !context.idempotency_key
  ) {
    return {
      decision_id: decisionId,
      allow: false,
      reasons: [
        {
          code: "oap.idempotency_conflict",
          message: "Idempotency key is required",
          severity: "error",
        },
      ],
      expires_in: 60,
      created_at: new Date().toISOString(),
    };
  }

  // 11. Check region authorization
  const allowedRegions = passport.regions || [];
  if (allowedRegions.length > 0 && !allowedRegions.includes(context.region)) {
    return {
      decision_id: decisionId,
      allow: false,
      reasons: [
        {
          code: "oap.region_blocked",
          message: `Region ${context.region} is not authorized`,
          severity: "error",
        },
      ],
      expires_in: 60,
      created_at: new Date().toISOString(),
    };
  }

  // If all checks pass, allow the charge
  return {
    decision_id: decisionId,
    allow: true,
    reasons: [
      {
        code: "oap.allowed",
        message: "Transaction within limits and policy requirements",
        severity: "info",
      },
    ],
    expires_in: 3600,
    assurance_level: passport.assurance_level,
    passport_digest: computePassportDigest(passport),
    signature: await signDecision(decisionId, true, [], env.APORT_SECRET),
    created_at: new Date().toISOString(),
  };
}

function generateDecisionId(): string {
  return `dec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function computePassportDigest(passport: PassportData): string {
  // Simple hash of passport data for integrity checking
  const data = JSON.stringify(passport);
  return btoa(data).substr(0, 16);
}

async function signDecision(
  decisionId: string,
  allow: boolean,
  reasons: DecisionReason[],
  secret: string
): Promise<string> {
  // Simple HMAC signature for decision integrity
  const payload = JSON.stringify({ decisionId, allow, reasons });
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
