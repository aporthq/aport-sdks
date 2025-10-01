/**
 * Refunds Policy Evaluator
 *
 * Evaluates refund requests against the payments.refund.v1 policy pack.
 */

import { PassportData } from "../../../types/passport";
import { Decision, DecisionReason } from "../../../shared/types/decision";
import { Env } from "../types";
import { getRequiredAssuranceLevel, meetsAssuranceRequirement } from "../money";
import { meetsMinimumAssurance } from "../assurance";

export async function evaluateRefundsV1(
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
          code: "AGENT_SUSPENDED",
          message: `Agent is ${passport.status} and cannot perform operations`,
          severity: "error",
        },
      ],
      expires_in: 60,
      created_at: new Date().toISOString(),
    };
  }

  // Validate all required fields from payments.refund.v1 policy
  const requiredFields = [
    "order_id",
    "customer_id",
    "amount_minor",
    "currency",
    "region",
    "reason_code",
    "idempotency_key",
  ];

  const missingFields = requiredFields.filter((field) => !context[field]);
  if (missingFields.length > 0) {
    return {
      decision_id: decisionId,
      allow: false,
      reasons: [
        {
          code: "MISSING_REQUIRED_FIELDS",
          message: `Missing required fields: ${missingFields.join(", ")}`,
          severity: "error",
        },
      ],
      expires_in: 60,
      created_at: new Date().toISOString(),
    };
  }

  const { amount_minor, currency, order_id, customer_id, region, reason_code } =
    context;

  // 1. Check capabilities (payments.refund)
  const agentCapabilities = passport.capabilities || [];
  const hasRefundCapability = agentCapabilities.some(
    (cap: any) => (typeof cap === "string" ? cap : cap.id) === "payments.refund"
  );

  if (!hasRefundCapability) {
    allow = false;
    reasons.push({
      code: "INSUFFICIENT_CAPABILITIES",
      message: "Missing required capability: payments.refund",
      severity: "error",
    });
  }

  // 2. Check currency support
  const supportedCurrencies = passport.limits?.supported_currencies || [];
  if (!supportedCurrencies.includes(currency)) {
    allow = false;
    reasons.push({
      code: "UNSUPPORTED_CURRENCY",
      message: `Currency ${currency} is not supported`,
      severity: "error",
    });
  }

  // 3. Check amount limits against currency limits
  const currencyLimits = passport.limits?.currency_limits?.[currency];
  if (currencyLimits && amount_minor > currencyLimits.max_per_tx) {
    allow = false;
    reasons.push({
      code: "AMOUNT_LIMIT_EXCEEDED",
      message: `Amount ${amount_minor} exceeds limit of ${currencyLimits.max_per_tx} for currency ${currency}`,
      severity: "error",
    });
  }

  // 4. Check region restrictions
  const allowedRegions = passport.regions || [];
  if (!allowedRegions.includes(region)) {
    allow = false;
    reasons.push({
      code: "REGION_NOT_ALLOWED",
      message: `Region ${region} is not allowed`,
      severity: "error",
    });
  }

  // 5. Check reason code validation
  const validReasonCodes = passport.limits?.refund_reason_codes || [];
  if (!validReasonCodes.includes(reason_code)) {
    allow = false;
    reasons.push({
      code: "INVALID_REASON_CODE",
      message: `Reason code ${reason_code} is not valid`,
      severity: "error",
    });
  }

  // 6. Check assurance level based on amount (dynamic) - use robust money utility
  const requiredAssurance = getRequiredAssuranceLevel(amount_minor, currency);
  const agentAssurance = (passport as any).assurance?.level || "L0";

  if (!meetsAssuranceRequirement(agentAssurance, requiredAssurance)) {
    allow = false;
    reasons.push({
      code: "INSUFFICIENT_ASSURANCE",
      message: `Required assurance level ${requiredAssurance} not met (current: ${agentAssurance})`,
      severity: "error",
    });
  }

  // 7. Check cross-currency denial
  if (context.order_currency && currency !== context.order_currency) {
    allow = false;
    reasons.push({
      code: "CROSS_CURRENCY_DENIED",
      message: "Cross-currency transactions are not allowed",
      severity: "error",
    });
  }

  // 8. Check daily refund limits (using Durable Objects)
  const dailyLimitResult = await checkDailyRefundLimit(
    env,
    passport.agent_id,
    currency,
    amount_minor,
    passport.limits?.refund_amount_daily_cap as number
  );
  if (!dailyLimitResult.allow) {
    allow = false;
    reasons.push(...dailyLimitResult.reasons);
  }

  // 9. Check order balance validation (if order_total_minor provided)
  if (context.order_total_minor !== undefined) {
    const alreadyRefunded = context.already_refunded_minor || 0;
    const remainingBalance = context.order_total_minor - alreadyRefunded;
    if (amount_minor > remainingBalance) {
      allow = false;
      reasons.push({
        code: "INSUFFICIENT_ORDER_BALANCE",
        message: `Refund amount ${amount_minor} exceeds remaining order balance ${remainingBalance}`,
        severity: "error",
      });
    }
  }

  // 10. Check idempotency
  if (idempotencyKey) {
    const idempotencyResult = await checkIdempotency(
      env,
      passport.agent_id,
      idempotencyKey
    );
    if (!idempotencyResult.allow) {
      allow = false;
      reasons.push(...idempotencyResult.reasons);
    }
  }

  return {
    decision_id: decisionId,
    allow,
    reasons,
    expires_in: 60,
    assurance_level: (passport as any).assurance?.level,
    passport_digest: computePassportDigest(passport),
    created_at: new Date().toISOString(),
  };
}

async function checkDailyRefundLimit(
  env: Env,
  agentId: string,
  currency: string,
  amount: number,
  dailyRefundLimit: number
): Promise<{ allow: boolean; reasons: DecisionReason[] }> {
  const reasons: DecisionReason[] = [];

  try {
    // Check if Durable Objects are available
    if (!env.APORT_COUNTERS) {
      console.warn("APORT_COUNTERS not available, skipping daily limit check");
      return { allow: true, reasons };
    }

    // Get Durable Object for refund counters
    const counterId = env.APORT_COUNTERS.idFromName(`refund-${agentId}`);
    const counter = env.APORT_COUNTERS.get(counterId);

    // Get daily limit from passport limits
    const dailyLimit = dailyRefundLimit || 10000; // $100 default

    // Check if increment would exceed limit
    const response = await counter.fetch("http://counter/increment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId,
        currency,
        amount,
        dailyLimit,
      }),
    });

    const result = await response.json();

    if (!(result as any).allowed) {
      reasons.push({
        code: "DAILY_REFUND_LIMIT_EXCEEDED",
        message: `Daily refund limit for ${currency} exceeded: ${
          (result as any).currentCount
        }/${(result as any).dailyLimit}`,
        severity: "error",
      });
      return { allow: false, reasons };
    }

    return { allow: true, reasons };
  } catch (error) {
    // If Durable Object fails, allow but log error
    console.error("Daily refund limit check failed:", error);
    return { allow: true, reasons };
  }
}

async function checkRegionRestrictions(
  passport: PassportData,
  context: Record<string, any>
): Promise<{ allow: boolean; reasons: DecisionReason[] }> {
  const reasons: DecisionReason[] = [];

  // Check if agent is allowed in the region
  if (passport.regions && passport.regions.length > 0) {
    const allowedRegions = passport.regions;
    const contextRegion = context.region || "US"; // Default region

    if (!allowedRegions.includes(contextRegion)) {
      reasons.push({
        code: "REGION_NOT_ALLOWED",
        message: `Agent not allowed in region ${contextRegion}`,
        severity: "error",
      });
      return { allow: false, reasons };
    }
  }

  return { allow: true, reasons };
}

async function checkIdempotency(
  env: Env,
  agentId: string,
  idempotencyKey: string
): Promise<{ allow: boolean; reasons: DecisionReason[] }> {
  const reasons: DecisionReason[] = [];

  // Check if this idempotency key has been used before
  const key = `idempotency:${agentId}:${idempotencyKey}`;
  const existing = await env.ai_passport_registry.get(key);

  if (existing) {
    reasons.push({
      code: "IDEMPOTENCY_KEY_USED",
      message: "Idempotency key has already been used",
      severity: "error",
    });
    return { allow: false, reasons };
  }

  // Store the idempotency key
  await env.ai_passport_registry.put(key, "used", { expirationTtl: 86400 }); // 24 hours

  return { allow: true, reasons };
}

function generateDecisionId(): string {
  return `dec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function computePassportDigest(passport: PassportData): string {
  const data = JSON.stringify(passport);
  return btoa(data).substr(0, 16);
}
