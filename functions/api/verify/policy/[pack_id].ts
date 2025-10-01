/**
 * Policy Verification Endpoint
 *
 * This endpoint handles policy verification requests and returns decisions.
 * All policy logic is implemented here using the moved utilities.
 */

import { cors } from "../../../utils/cors";
import { createLogger } from "../../../utils/logger";
import { buildPassportObject } from "../../../utils/serialization";
import { ApiResponse, HTTP_STATUS } from "../../../utils/api-response";
import {
  KVNamespace,
  R2Bucket,
  PagesFunction,
  DurableObjectNamespace,
} from "@cloudflare/workers-types";
import { PassportData } from "../../../../types/passport";
import {
  Decision,
  DecisionReason,
  VerificationContext,
} from "../../../../shared/types/decision";

// Import comprehensive policy utilities
import { checkCapabilities } from "../../../utils/policy/capability";
import { evaluateAssurance } from "../../../utils/policy/assurance";
import { evaluateLimits } from "../../../utils/policy/limits";
import { evaluateRegions } from "../../../utils/policy/regions";
import { evaluateTaxonomy } from "../../../utils/policy/taxonomy";
import { evaluateMCP } from "../../../utils/policy/mcp";

// Import policy-specific evaluators
import { evaluateRefundsV1 } from "../../../utils/policy/payments.refund.v1";
import { evaluatePaymentsChargeV1 } from "../../../utils/policy/payments.charge.v1";
import { evaluateReleaseV1 } from "../../../utils/policy/release.v1";
import { evaluateDataExportV1 } from "../../../utils/policy/data-export.v1";
import { evaluateMessagingV1 } from "../../../utils/policy/messaging.v1";
import { evaluateRepoV1 } from "../../../utils/policy/repo.v1";

interface Env {
  ai_passport_registry: KVNamespace;
  APORT_R2: R2Bucket;
  APORT_SECRET: string;
  APORT_COUNTERS: DurableObjectNamespace;
  AP_VERSION: string;
  VERIFY_RPM?: string;
}

// const logger = createLogger("policy-verification");

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const packId = params.pack_id as string;
  const startTime = performance.now();

  // Initialize response handler
  const response = new ApiResponse(cors(request), env.ai_passport_registry);

  try {
    // Handle CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: cors(request),
      });
    }

    if (request.method !== "POST") {
      return response.error(
        {
          error: "method_not_allowed",
          message: "Method not allowed",
        },
        405
      );
    }

    // Parse request body
    const body = (await request.json()) as any;
    const { context: verificationContext, passport_data } = body;

    if (!verificationContext) {
      return response.badRequest("Missing verification context");
    }

    const {
      agent_id,
      policy_id,
      context: policyContext,
      idempotency_key,
    } = verificationContext as VerificationContext;

    if (!agent_id || !policy_id) {
      return response.badRequest(
        "Missing required fields: agent_id, policy_id",
        ["agent_id", "policy_id"]
      );
    }

    // Get passport data
    let passport: PassportData;
    if (passport_data) {
      passport = passport_data;
    } else {
      // For testing, if KV is not available, return error
      if (!env.ai_passport_registry) {
        return response.badRequest(
          "Passport data required for testing (KV not available)"
        );
      }

      // Fetch from KV
      const passportKey = `passport:${agent_id}`;
      const passportData = await env.ai_passport_registry.get(passportKey);

      if (!passportData) {
        return response.error(
          {
            error: "not_found",
            message: "Passport not found",
          },
          404
        );
      }

      passport = JSON.parse(passportData);
    }

    // Evaluate policy based on pack ID
    const decision = await evaluatePolicy(
      env,
      packId,
      passport,
      policyContext || {},
      idempotency_key
    );

    // Return decision with Server-Timing headers
    const endTime = performance.now();
    const processingTime = endTime - startTime;

    const finalResponse = response.success({ decision }, 200);
    finalResponse.headers.set(
      "Server-Timing",
      `policy-eval;dur=${processingTime.toFixed(2)}`
    );
    return finalResponse;
  } catch (error) {
    console.error("Policy verification failed", {
      error: error instanceof Error ? error.message : String(error),
      packId,
    });
    const errorResponse = new ApiResponse(
      cors(request),
      env.ai_passport_registry
    );
    return errorResponse.error(
      {
        error: "internal_server_error",
        message: "Internal server error",
      },
      500
    );
  }
};

async function loadPolicyPack(env: Env, packId: string): Promise<any> {
  // For testing, if KV is not available, return null to use mock
  if (!env.ai_passport_registry) {
    return null;
  }

  const policyKey = `policy:${packId}`;
  const policyData = await env.ai_passport_registry.get(policyKey);

  if (!policyData) {
    return null;
  }

  return JSON.parse(policyData);
}

async function evaluatePolicy(
  env: Env,
  packId: string,
  passport: PassportData,
  context: Record<string, any>,
  idempotencyKey?: string
): Promise<Decision> {
  const decisionId = generateDecisionId();
  const reasons: DecisionReason[] = [];
  let allow = true;

  try {
    // Route to specific policy evaluator
    switch (packId) {
      case "payments.refund.v1":
        return await evaluateRefundsV1(env, passport, context, idempotencyKey);

      case "payments.charge.v1":
        return await evaluatePaymentsChargeV1(
          env,
          passport,
          context,
          idempotencyKey
        );

      case "release.v1":
        return await evaluateReleaseV1(env, passport, context, idempotencyKey);

      case "data.export.v1":
        return await evaluateDataExportV1(
          env,
          passport,
          context,
          idempotencyKey
        );

      case "messaging.v1":
        return await evaluateMessagingV1(
          env,
          passport,
          context,
          idempotencyKey
        );

      case "repo.v1":
        return await evaluateRepoV1(env, passport, context, idempotencyKey);

      default:
        // Generic policy evaluation
        return await evaluateGenericPolicy(
          env,
          packId,
          passport,
          context,
          idempotencyKey
        );
    }
  } catch (error) {
    console.error("Policy evaluation failed", {
      error: error instanceof Error ? error.message : String(error),
      packId,
    });

    return {
      decision_id: decisionId,
      allow: false,
      reasons: [
        {
          code: "oap.evaluation_error",
          message: "Policy evaluation failed",
          severity: "error",
        },
      ],
      expires_in: 60,
      created_at: new Date().toISOString(),
    };
  }
}

async function evaluateGenericPolicy(
  env: Env,
  packId: string,
  passport: PassportData,
  context: Record<string, any>,
  idempotencyKey?: string
): Promise<Decision> {
  const decisionId = generateDecisionId();
  const reasons: DecisionReason[] = [];
  let allow = true;

  // Load policy pack
  const policyPack = await loadPolicyPack(env, packId);
  if (!policyPack) {
    return {
      decision_id: decisionId,
      allow: false,
      reasons: [
        {
          code: "oap.policy_not_found",
          message: "Policy pack not found",
          severity: "error",
        },
      ],
      expires_in: 60,
      created_at: new Date().toISOString(),
    };
  }

  // 1. Validate required fields
  const fieldValidationResult = validatePolicyFields(policyPack, context);
  if (!fieldValidationResult.valid) {
    allow = false;
    reasons.push({
      code: "oap.missing_required_fields",
      message: fieldValidationResult.errors.join(", "),
      severity: "error",
    });
  }

  // 2. Check capabilities
  if (
    policyPack.requires_capabilities &&
    policyPack.requires_capabilities.length > 0
  ) {
    const capabilityResult = checkCapabilities(
      passport,
      policyPack.requires_capabilities
    );
    if (!(await capabilityResult).allow) {
      allow = false;
      reasons.push({
        code: "oap.unknown_capability",
        message:
          (await capabilityResult).reasons[0]?.message ||
          "Missing required capabilities",
        severity: "error",
      });
    }
  }

  // 3. Evaluate assurance requirements
  const assuranceResult = await evaluateAssurance(
    passport,
    policyPack,
    context
  );
  if (!assuranceResult.allow) {
    allow = false;
    reasons.push(...assuranceResult.reasons);
  }

  // 4. Evaluate limits
  const limitsResult = await evaluateLimits(
    env,
    passport,
    policyPack,
    context,
    idempotencyKey
  );
  if (!limitsResult.allow) {
    allow = false;
    reasons.push(...limitsResult.reasons);
  }

  // 5. Evaluate regions
  const regionsResult = await evaluateRegions(passport, policyPack, context);
  if (!regionsResult.allow) {
    allow = false;
    reasons.push(...regionsResult.reasons);
  }

  // 6. Evaluate taxonomy
  const taxonomyResult = await evaluateTaxonomy(passport, policyPack, context);
  if (!taxonomyResult.allow) {
    allow = false;
    reasons.push(...taxonomyResult.reasons);
  }

  // 7. Evaluate MCP
  const mcpResult = await evaluateMCP(passport, policyPack, context);
  if (!mcpResult.allow) {
    allow = false;
    reasons.push(...mcpResult.reasons);
  }

  // 8. Evaluate enforcement rules
  const enforcementResult = evaluateEnforcementRules(
    policyPack,
    context,
    passport
  );
  if (!enforcementResult.allow) {
    allow = false;
    reasons.push(...enforcementResult.reasons);
  }

  return {
    decision_id: decisionId,
    allow,
    reasons,
    expires_in: 60,
    assurance_level: (passport as any).assurance?.level,
    passport_digest: computePassportDigest(passport),
    signature: await signDecision(decisionId, allow, reasons, env.APORT_SECRET),
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

// Policy validation functions
function validatePolicyFields(
  policyPack: any,
  context: Record<string, any>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required fields
  const requiredFields = policyPack.required_fields || [];
  for (const field of requiredFields) {
    if (!context[field] || context[field] === "" || context[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Check optional fields (if present, they should be valid)
  const optionalFields = policyPack.optional_fields || [];
  for (const field of optionalFields) {
    if (
      context[field] !== undefined &&
      context[field] !== null &&
      context[field] === ""
    ) {
      errors.push(`Invalid field: ${field} cannot be empty`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function evaluateEnforcementRules(
  policyPack: any,
  context: Record<string, any>,
  passport: PassportData
): { allow: boolean; reasons: DecisionReason[] } {
  const reasons: DecisionReason[] = [];
  const enforcement = policyPack.enforcement || {};

  // Check currency support
  if (enforcement.currency_supported && context.currency) {
    const supportedCurrencies = passport.limits?.supported_currencies || [];
    if (!supportedCurrencies.includes(context.currency)) {
      reasons.push({
        code: "UNSUPPORTED_CURRENCY",
        message: `Currency ${context.currency} is not supported`,
        severity: "error",
      });
    }
  }

  // Check region validation
  if (enforcement.region_in && context.region) {
    const allowedRegions = passport.regions || [];
    if (!allowedRegions.includes(context.region)) {
      reasons.push({
        code: "REGION_NOT_ALLOWED",
        message: `Region ${context.region} is not allowed`,
        severity: "error",
      });
    }
  }

  // Check reason code validation
  if (enforcement.reason_code_valid && context.reason_code) {
    const validReasons = passport.limits?.refund_reason_codes || [];
    if (!validReasons.includes(context.reason_code)) {
      reasons.push({
        code: "INVALID_REASON_CODE",
        message: `Reason code ${context.reason_code} is not valid`,
        severity: "error",
      });
    }
  }

  // Check idempotency requirement
  if (enforcement.idempotency_required && !context.idempotency_key) {
    reasons.push({
      code: "IDEMPOTENCY_REQUIRED",
      message: "Idempotency key is required",
      severity: "error",
    });
  }

  // Check order ID requirement
  if (enforcement.order_id_required && !context.order_id) {
    reasons.push({
      code: "ORDER_ID_REQUIRED",
      message: "Order ID is required",
      severity: "error",
    });
  }

  // Check customer ID requirement
  if (enforcement.customer_id_required && !context.customer_id) {
    reasons.push({
      code: "CUSTOMER_ID_REQUIRED",
      message: "Customer ID is required",
      severity: "error",
    });
  }

  // Check cross-currency denial
  if (
    enforcement.cross_currency_denied &&
    context.currency &&
    context.order_currency
  ) {
    if (context.currency !== context.order_currency) {
      reasons.push({
        code: "CROSS_CURRENCY_DENIED",
        message: "Cross-currency transactions are not allowed",
        severity: "error",
      });
    }
  }

  return {
    allow: reasons.length === 0,
    reasons,
  };
}
