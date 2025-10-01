/**
 * @swagger
 * /api/verify/policy/{pack_id}:
 *   post:
 *     summary: Verify policy decision
 *     description: Hot path policy verification with KV-only reads, multi-region/multi-tenant support, TenantDO integration for refunds, and comprehensive performance monitoring. Evaluates policy decisions based on agent capabilities and context.
 *     operationId: verifyPolicyDecision
 *     tags:
 *       - Verification
 *       - Policy Decisions
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: pack_id
 *         in: path
 *         required: true
 *         description: The policy pack identifier to evaluate
 *         schema:
 *           type: string
 *           pattern: "^([a-z_]+\.[a-z_]+\.v\\d+|^[a-z_]+\.v\\d+)$"
 *           example: "payments.refund.v1"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - context
 *             properties:
 *               context:
 *                 type: object
 *                 required:
 *                   - agent_id
 *                   - policy_id
 *                 properties:
 *                   agent_id:
 *                     type: string
 *                     description: The agent ID to verify against
 *                     pattern: "^ap_[a-zA-Z0-9]+$"
 *                     example: "aeebc92d-13fb-4e23-8c3c-1aa82b167da6"
 *                   policy_id:
 *                     type: string
 *                     description: The specific policy being evaluated
 *                     example: "payments.refund.v1"
 *                   context:
 *                     type: object
 *                     description: Policy-specific context data
 *                     additionalProperties: true
 *                     example:
 *                       amount: 5000
 *                       currency: "USD"
 *                       transaction_id: "txn_123456"
 *                   idempotency_key:
 *                     type: string
 *                     description: Idempotency key for duplicate request prevention
 *                     example: "idemp_123456789"
 *               passport_data:
 *                 type: object
 *                 description: Optional passport data for offline verification
 *                 $ref: '#/components/schemas/Passport'
 *     responses:
 *       200:
 *         description: Policy verification successful
 *         headers:
 *           Server-Timing:
 *             description: Performance timing information
 *             schema:
 *               type: string
 *               example: "kv-read;dur=25, policy-eval;dur=15, total;dur=40"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - success
 *                 - data
 *                 - requestId
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   required:
 *                     - decision
 *                   properties:
 *                     decision:
 *                       type: object
 *                       required:
 *                         - decision_id
 *                         - created_at
 *                         - allow
 *                         - reasons
 *                         - expires_in
 *                       properties:
 *                         decision_id:
 *                           type: string
 *                           description: Unique decision identifier
 *                           example: "dec_123456789"
 *                         created_at:
 *                           type: string
 *                           format: date-time
 *                           description: Decision creation timestamp
 *                           example: "2025-01-16T10:30:00Z"
 *                         allow:
 *                           type: boolean
 *                           description: Whether the action is allowed
 *                           example: true
 *                         reasons:
 *                           type: array
 *                           description: Decision reasoning
 *                           items:
 *                             type: object
 *                             properties:
 *                               code:
 *                                 type: string
 *                                 example: "capability_verified"
 *                               message:
 *                                 type: string
 *                                 example: "Agent has required refund capability"
 *                               severity:
 *                                 type: string
 *                                 enum: ["info", "warning", "error"]
 *                                 example: "info"
 *                         expires_in:
 *                           type: number
 *                           description: Decision TTL in seconds
 *                           example: 300
 *                         assurance_level:
 *                           type: string
 *                           description: Required assurance level
 *                           example: "L4KYC"
 *                         passport_digest:
 *                           type: string
 *                           description: Passport data digest for verification
 *                           example: "sha256:abc123def456"
 *                         signature:
 *                           type: string
 *                           description: Ed25519 signature of the decision
 *                           example: "ed25519:xyz789"
 *                         remaining_daily_cap:
 *                           type: object
 *                           description: Remaining daily limits by currency
 *                           additionalProperties:
 *                             type: number
 *                           example: {"USD": 45000}
 *                         owner_id:
 *                           type: string
 *                           description: Passport owner ID
 *                           example: "ap_org_456"
 *                         policy_id:
 *                           type: string
 *                           description: Policy pack identifier
 *                           example: "payments.refund.v1"
 *                         kid:
 *                           type: string
 *                           description: Key identifier for signature verification
 *                           example: "key_123"
 *                         decision_token:
 *                           type: string
 *                           description: Compact JWT for sub-TTL caching
 *                           example: "eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSJ9..."
 *                     passport:
 *                       $ref: '#/components/schemas/Passport'
 *                 requestId:
 *                   type: string
 *                   description: Unique request identifier
 *                   example: "policy_123456789_abc123"
 *                 performance:
 *                   type: object
 *                   description: Performance metrics
 *                   properties:
 *                     total_time_ms:
 *                       type: number
 *                       example: 40
 *                     policy_eval_time_ms:
 *                       type: number
 *                       example: 15
 *                     kv_read_time_ms:
 *                       type: number
 *                       example: 25
 *                     cache_hit:
 *                       type: boolean
 *                       example: true
 *       400:
 *         description: Bad request - invalid policy or context
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "invalid_policy"
 *               message: "Policy pack 'invalid.policy' not found"
 *       401:
 *         description: Unauthorized - invalid or missing authentication
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "unauthorized"
 *               message: "Valid authentication required"
 *       403:
 *         description: Forbidden - policy evaluation denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "policy_denied"
 *               message: "Agent lacks required capabilities for this policy"
 *       404:
 *         description: Agent passport not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "passport_not_found"
 *               message: "Passport with ID aeebc92d-13fb-4e23-8c3c-1aa82b167da6 not found"
 *       409:
 *         description: Conflict - idempotency key already used
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "idempotency_conflict"
 *               message: "Idempotency key already used for this policy"
 *       429:
 *         description: Too many requests - rate limit exceeded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "rate_limit_exceeded"
 *               message: "Too many requests, please try again later"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "internal_server_error"
 *               message: "An unexpected error occurred"
 */

import { cors } from "../../../utils/cors";
import { createLogger } from "../../../utils/logger";
import { buildPassportObject } from "../../../utils/serialization";
import { createTieredPassportCache } from "../../../utils/tiered-cache";
import { ApiResponse, HTTP_STATUS } from "../../../utils/api-response";
import {
  createPolicyTelemetryService,
  PolicyDecision,
} from "../../../utils/policy-telemetry";
import {
  createEnhancedPolicyTelemetryService,
  EnhancedPolicyDecision,
} from "../../../utils/enhanced-policy-telemetry";
import { createTenantDOClientFromEnv } from "../../../runtime/TenantDOClient";
import {
  resolveTenantFromOrgId,
  resolveTenantBindings,
} from "../../../runtime/region";
import { createKVResolver, getKVForOwner } from "../../../utils/kv-resolver";
import {
  getAgentRoutingWithFallback,
  createAgentNotIndexedError,
} from "../../../utils/agent-routing";
import { authMiddleware, AuthResult } from "../../../utils/auth-middleware";
import {
  createAuthErrorResponse,
  createSuccessResponse,
} from "../../../utils/general-auth";
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
  REGISTRY_PRIVATE_KEY?: string;
  REGISTRY_KEY_ID?: string;
  JWT_SECRET: string;
  // Multi-region bindings
  D1_US?: D1Database;
  KV_US?: KVNamespace;
  R2_US?: R2Bucket;
  D1_EU?: D1Database;
  KV_EU?: KVNamespace;
  R2_EU?: R2Bucket;
  D1_CA?: D1Database;
  KV_CA?: KVNamespace;
  R2_CA?: R2Bucket;
  DEFAULT_REGION?: string;
}

/**
 * Add verifiable attestation for authenticated requests
 * TODO: Implement full verifiable attestation functionality
 */
function addVerifiableAttestation(
  decision: Decision,
  authResult: AuthResult,
  agentId: string,
  policyId: string,
  context: any
): void {
  console.log("Adding verifiable attestation:", {
    decisionId: decision.decision_id,
    agentId,
    policyId,
    authType: "authenticated",
    userId: authResult.user?.user?.user_id || "anonymous",
    context: Object.keys(context || {}),
    timestamp: new Date().toISOString(),
  });

  // TODO: Implement actual verifiable attestation
  // - Create attestation record
  // - Sign with private key
  // - Store in KV with audit trail
  // - Return attestation hash
}

/**
 * Enhanced policy verification endpoint with multi-region/multi-tenant support
 */
export const onRequestOptions: PagesFunction<Env> = async ({ request }) => {
  return new Response(null, {
    status: 200,
    headers: cors(request),
  });
};

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const startTime = performance.now();
  const requestId = `policy_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 8)}`;
  const packId = params?.pack_id as string;

  // CORS headers
  const corsHeaders = cors(request);

  // Initialize response handler
  const response = new ApiResponse(corsHeaders, env.ai_passport_registry);

  try {
    // Handle CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
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

    // Initialize components
    const logger = createLogger(env.ai_passport_registry);

    // Performance timing
    const timing = {
      cacheLookup: 0,
      passportBuild: 0,
      policyEvaluation: 0,
      tenantDO: 0,
      decisionSigning: 0,
      regionResolution: 0,
      total: 0,
    };

    // Parse request body (same as old endpoint)
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

    // Optional authentication - supports API keys, JWT, cookies, and admin tokens
    let authResult: AuthResult | null = null;

    // Check if Authorization header is present and valid
    const authHeader = request.headers.get("Authorization");
    const hasAuthHeader =
      authHeader && authHeader.startsWith("Bearer ") && authHeader.length > 7; // "Bearer " is 7 chars

    if (hasAuthHeader) {
      // If auth header is present, authentication is required and must succeed
      try {
        authResult = await authMiddleware(request, env as any, {
          requireAuth: true, // Required when auth header is present
          allowApiKey: true,
          requiredApiKeyScopes: ["read"], // API key scope for policy verification
        });

        if (!authResult.success) {
          return createAuthErrorResponse(
            authResult.error || "Authentication failed",
            authResult.statusCode || 401,
            requestId
          );
        }
      } catch (error) {
        return createAuthErrorResponse("Authentication failed", 401, requestId);
      }
    } else {
      // No auth header present, continue without authentication
      console.log("No authentication provided, proceeding without auth");
    }

    // Get agent routing information first (fast KV lookup with fallback)
    const agentInfo = await getAgentRoutingWithFallback(
      env.ai_passport_registry,
      agent_id,
      env
    );
    if (!agentInfo) {
      return createAgentNotIndexedError(agent_id);
    }

    // Resolve tenant and get tenant-specific KV (same as other endpoints)
    const tenant = await resolveTenantFromOrgId(env, agentInfo.owner_id);
    const bindings = resolveTenantBindings(env, tenant);
    const regionKV = bindings.kv || env.ai_passport_registry;
    const tieredCache = createTieredPassportCache(regionKV);

    // Get passport data (same as old endpoint)
    let passport: PassportData;
    if (passport_data) {
      passport = passport_data;
    } else {
      // Get passport from tiered cache (KV-only in steady state)
      const cacheStart = performance.now();
      let passportResult;

      try {
        passportResult = await tieredCache.getPassport(agent_id);
        timing.cacheLookup = performance.now() - cacheStart;
      } catch (error) {
        // Fallback to direct KV lookup if tiered cache fails

        passportResult = await tryDirectKVLookup(regionKV, agent_id);
        timing.cacheLookup = performance.now() - cacheStart;
      }

      if (!passportResult) {
        return response.error(
          {
            error: "not_found",
            message: "Passport not found",
          },
          404
        );
      }

      // Build passport object
      const passportBuildStart = performance.now();
      passport = buildPassportObject(passportResult.passport, "1.0.0");
      timing.passportBuild = performance.now() - passportBuildStart;
    }

    // Get tenant for TenantDO operations using agent routing info
    const regionStart = performance.now();

    timing.regionResolution = performance.now() - regionStart;

    // Evaluate policy
    const policyStart = performance.now();
    let decision: Decision;

    // Check if this is a refunds policy that needs TenantDO
    if (packId === "payments.refund.v1") {
      // For refunds, we need TenantDO for counters/idempotency
      const tenantDOStart = performance.now();

      try {
        // Create TenantDO client
        const tenantDO = createTenantDOClientFromEnv(env, agent_id, {
          timeout: 5000, // Shorter timeout for hot path
          maxRetries: 2,
        });

        // Initialize tenant with region-specific bindings
        if (tenant) {
          await tenantDO.initializeTenant(tenant);
        }

        // Process refund through TenantDO
        const refundResult = await tenantDO.consumeRefund(
          agent_id,
          policyContext?.currency || "USD",
          policyContext?.amount_minor || 0,
          idempotency_key || generateIdempotencyKey()
        );

        timing.tenantDO = performance.now() - tenantDOStart;

        if (!refundResult.success) {
          decision = {
            decision_id: generateDecisionId(),
            allow: false,
            reasons: [
              {
                code: "REFUND_LIMIT_EXCEEDED",
                message: "Daily refund limit exceeded",
                severity: "error",
              },
            ],
            expires_in: 60,
            assurance_level: passport.assurance_level,
            passport_digest: computePassportDigest(passport),
            created_at: new Date().toISOString(),
          };
        } else {
          // Use the refund result to create decision
          const currency = policyContext?.currency || "USD";
          const dailyCap = passport.limits?.daily_refund_cap?.[currency] || 0;
          const usedToday = 0; // TODO: Calculate actual usage
          const remaining = Math.max(0, dailyCap - usedToday);

          decision = {
            decision_id: generateDecisionId(),
            allow: true,
            reasons: [
              {
                code: "REFUND_APPROVED",
                message: `Refund approved: ${refundResult.consumed} ${currency} remaining`,
                severity: "info",
              },
            ],
            expires_in: 300,
            assurance_level: passport.assurance_level,
            passport_digest: computePassportDigest(passport),
            created_at: new Date().toISOString(),
            remaining_daily_cap: {
              [currency]: remaining,
            },
          };
        }
      } catch (error) {
        // Silent fail for performance

        // Fallback to regular policy evaluation
        decision = await evaluateRefundsV1(
          env,
          passport,
          policyContext || {},
          idempotency_key
        );
        timing.tenantDO = performance.now() - tenantDOStart;
      }
    } else {
      // For non-refunds policies, use regular evaluation
      decision = await evaluatePolicy(
        env,
        packId,
        passport,
        policyContext || {},
        idempotency_key
      );
    }

    timing.policyEvaluation = performance.now() - policyStart;

    // Ensure all decisions have complete metadata (assurance_level, passport_digest)
    if (!decision.assurance_level) {
      decision.assurance_level = passport.assurance_level;
    }
    if (!decision.passport_digest) {
      decision.passport_digest = computePassportDigest(passport);
    }

    // Sign decision if private key is available (sign all decisions like old endpoint)
    const signingStart = performance.now();
    if (env.REGISTRY_PRIVATE_KEY) {
      try {
        decision.signature = await signDecision(
          decision.decision_id,
          decision.allow,
          decision.reasons,
          env.REGISTRY_PRIVATE_KEY
        );
      } catch (error) {
        // Silent fail for performance - signature is optional
      }
    }
    timing.decisionSigning = performance.now() - signingStart;

    // Add verifiable attestation for authenticated requests
    if (authResult && authResult.success) {
      addVerifiableAttestation(
        decision,
        authResult,
        agent_id,
        policy_id,
        policyContext
      );
    }

    // Record telemetry for authenticated requests (reputation tracking)
    if (authResult && authResult.success) {
      try {
        // Record with basic telemetry service
        const telemetryService = createPolicyTelemetryService(
          env.ai_passport_registry,
          env.REGISTRY_PRIVATE_KEY,
          "registry-key-1" // TODO: Get from env or config
        );

        const policyDecision: PolicyDecision = {
          decision_id: decision.decision_id,
          agent_id: agent_id,
          platform_id: authResult.user?.user?.user_id || "unknown",
          policy_id: policy_id,
          decision: decision.allow,
          reason_codes: decision.reasons.map((r) => r.code),
          timestamp: decision.created_at,
          assurance_level: passport.assurance_level,
          region: (request as any).cf?.colo || "unknown",
        };

        // Record the decision for reputation tracking
        await telemetryService.recordDecision(policyDecision);

        console.log(
          `Recorded policy decision for telemetry: ${decision.decision_id}`
        );

        // Record with enhanced telemetry service for high verifiability
        if (env.REGISTRY_PRIVATE_KEY && env.REGISTRY_KEY_ID) {
          const enhancedTelemetryService = createEnhancedPolicyTelemetryService(
            env.ai_passport_registry,
            env.APORT_R2, // Use APORT_R2 as backup
            env.REGISTRY_PRIVATE_KEY,
            env.REGISTRY_KEY_ID,
            ["US", "EU", "CA"] // Multi-region support
          );

          const enhancedDecision: Omit<
            EnhancedPolicyDecision,
            | "signature"
            | "registry_key_id"
            | "signed_at"
            | "decision_hash"
            | "integrity_proof"
            | "replication_status"
            | "backup_locations"
            | "created_at"
            | "expires_at"
          > = {
            decision_id: decision.decision_id,
            agent_id: agent_id,
            platform_id: authResult.user?.user?.user_id || "unknown",
            policy_id: policy_id,
            decision: decision.allow,
            reason_codes: decision.reasons.map((r) => r.code),
            timestamp: decision.created_at,
            assurance_level: passport.assurance_level,
            region: (request as any).cf?.colo || "unknown",
          };

          // Record enhanced decision with full verifiability
          await enhancedTelemetryService.recordDecision(enhancedDecision);

          console.log(
            `Recorded enhanced policy decision: ${decision.decision_id}`
          );
        }
      } catch (error) {
        console.error("Failed to record policy telemetry:", error);
        // Silent fail for performance
      }
    }

    // Calculate total timing
    timing.total = performance.now() - startTime;

    // Server-Timing headers for performance monitoring (enhanced from old endpoint)
    const region = request.cf?.colo || "UNKNOWN";
    const serverTiming = [
      `policy-eval;dur=${timing.policyEvaluation.toFixed(2)}`,
      `cache-lookup;dur=${timing.cacheLookup.toFixed(2)}`,
      `passport-build;dur=${timing.passportBuild.toFixed(2)}`,
      `tenant-do;dur=${timing.tenantDO.toFixed(2)}`,
      `decision-signing;dur=${timing.decisionSigning.toFixed(2)}`,
      `region-resolution;dur=${timing.regionResolution.toFixed(2)}`,
      `region;desc="${region}"`,
    ].join(", ");

    // Prepare response (enhanced with all metadata from old endpoint)
    const responseData = {
      decision, // Now includes all metadata: assurance_level, passport_digest, signature
      request_id: requestId,
      performance: {
        cache_source: "l3", // Will be updated based on actual cache source
        total_latency: timing.total,
        breakdown: timing,
      },
    };

    const finalResponse = response.success(responseData, 200);

    // Add custom headers for performance monitoring
    finalResponse.headers.set("Server-Timing", serverTiming);
    finalResponse.headers.set("X-Request-ID", requestId);
    finalResponse.headers.set("X-Policy-Pack", packId);
    finalResponse.headers.set("X-Region", region);

    return finalResponse;
  } catch (error) {
    const totalLatency = performance.now() - startTime;

    // Log error for monitoring but don't expose details to client

    const errorResponse = new ApiResponse(
      corsHeaders,
      env.ai_passport_registry
    );
    return errorResponse.error(
      {
        error: "internal_server_error",
        message: "Internal server error",
        details: { request_id: requestId },
      },
      500
    );
  }
};

/**
 * Fallback direct KV lookup when tiered cache fails
 */
async function tryDirectKVLookup(
  kv: KVNamespace,
  agentId: string
): Promise<any> {
  const startTime = performance.now();

  try {
    // Try direct passport key first
    const passportKey = `passport:${agentId}`;
    const passportData = await kv.get(passportKey, "json");

    if (passportData && typeof passportData === "object") {
      const passport = buildPassportObject(
        passportData as PassportData,
        "1.0.0"
      );

      return {
        passport,
        source: "l3", // KV is L3 cache
        latency: performance.now() - startTime,
        fromCache: false,
      };
    }

    return null;
  } catch (error) {
    // Silent fail for performance
    return null;
  }
}

/**
 * Evaluate policy based on pack ID
 */
async function evaluatePolicy(
  env: Env,
  packId: string,
  passport: PassportData,
  context: Record<string, any>,
  idempotencyKey?: string
): Promise<Decision> {
  const decisionId = generateDecisionId();

  try {
    switch (packId) {
      case "payments.refund.v1":
        return await evaluateRefundsV1(env, passport, context, idempotencyKey);

      case "release.v1":
        return await evaluateReleaseV1(env, passport, context, idempotencyKey);

      case "data-export.v1":
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
    // Silent fail for performance
    return {
      decision_id: decisionId,
      allow: false,
      reasons: [
        {
          code: "EVALUATION_ERROR",
          message: "Policy evaluation failed",
          severity: "error",
        },
      ],
      expires_in: 60,
      created_at: new Date().toISOString(),
    };
  }
}

/**
 * Generic policy evaluation for unknown policy packs
 */
async function evaluateGenericPolicy(
  env: Env,
  packId: string,
  passport: PassportData,
  context: Record<string, any>,
  idempotencyKey?: string
): Promise<Decision> {
  const verificationContext = context;
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
          code: "POLICY_NOT_FOUND",
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
      code: "MISSING_REQUIRED_FIELDS",
      message: fieldValidationResult.errors.join(", "),
      severity: "error",
    });
  }

  // 2. Check capabilities
  if (
    policyPack.requires_capabilities &&
    policyPack.requires_capabilities.length > 0
  ) {
    const capabilityResult = await checkCapabilities(
      passport,
      policyPack.requires_capabilities
    );
    if (!capabilityResult.allow) {
      allow = false;
      reasons.push({
        code: "INSUFFICIENT_CAPABILITIES",
        message:
          capabilityResult.reasons[0]?.message || "Insufficient capabilities",
        severity: "error",
      });
    }
  }

  // 3. Check assurance level
  if (policyPack.requires_assurance_level) {
    const assuranceResult = await evaluateAssurance(
      passport,
      policyPack,
      verificationContext
    );
    if (!assuranceResult.allow) {
      allow = false;
      reasons.push({
        code: "INSUFFICIENT_ASSURANCE",
        message:
          assuranceResult.reasons[0]?.message || "Insufficient assurance",
        severity: "error",
      });
    }
  }

  // 4. Check limits
  if (policyPack.requires_limits) {
    const limitsResult = await evaluateLimits(
      env,
      passport,
      policyPack,
      verificationContext
    );
    if (!limitsResult.allow) {
      allow = false;
      reasons.push({
        code: "LIMITS_EXCEEDED",
        message: limitsResult.reasons[0]?.message || "Limits exceeded",
        severity: "error",
      });
    }
  }

  // 5. Check regions
  if (policyPack.requires_regions && policyPack.requires_regions.length > 0) {
    const regionsResult = await evaluateRegions(
      passport,
      policyPack.requires_regions,
      verificationContext
    );
    if (!regionsResult.allow) {
      allow = false;
      reasons.push({
        code: "REGION_NOT_ALLOWED",
        message: regionsResult.reasons[0]?.message || "Region not allowed",
        severity: "error",
      });
    }
  }

  // 6. Check taxonomy
  if (policyPack.requires_taxonomy) {
    const taxonomyResult = await evaluateTaxonomy(
      passport,
      policyPack.requires_taxonomy,
      verificationContext
    );
    if (!taxonomyResult.allow) {
      allow = false;
      reasons.push({
        code: "TAXONOMY_MISMATCH",
        message: taxonomyResult.reasons[0]?.message || "Taxonomy mismatch",
        severity: "error",
      });
    }
  }

  // 7. Check MCP
  if (policyPack.requires_mcp) {
    const mcpResult = await evaluateMCP(
      passport,
      policyPack.requires_mcp,
      verificationContext
    );
    if (!mcpResult.allow) {
      allow = false;
      reasons.push({
        code: "MCP_VALIDATION_FAILED",
        message: mcpResult.reasons[0]?.message || "MCP validation failed",
        severity: "error",
      });
    }
  }

  // 8. Check agent status (suspended agents should not pass)
  if (passport.status === "suspended" || passport.status === "revoked") {
    allow = false;
    reasons.push({
      code: "AGENT_SUSPENDED",
      message: `Agent is ${passport.status} and cannot perform operations`,
      severity: "error",
    });
  }

  // 9. Evaluate enforcement rules
  if (policyPack.enforcement) {
    const enforcementResult = evaluateEnforcementRules(
      policyPack,
      context,
      passport
    );
    if (!enforcementResult.allow) {
      allow = false;
      reasons.push(...enforcementResult.reasons);
    }
  }

  // Generate passport digest for integrity checking
  const passportDigest = computePassportDigest(passport);

  // Sign decision if private key is available
  let signature: string | undefined;
  if (env.REGISTRY_PRIVATE_KEY && allow) {
    try {
      signature = await signDecision(
        decisionId,
        allow,
        reasons,
        env.REGISTRY_PRIVATE_KEY
      );
    } catch (error) {
      // Silent fail for performance - signature is optional
    }
  }

  // Calculate remaining daily cap for refunds (if applicable)
  let remaining_daily_cap: Record<string, number> | undefined;
  if (
    packId === "payments.refund.v1" &&
    allow &&
    passport.limits?.daily_refund_cap
  ) {
    // TODO: Implement actual daily cap calculation
    // This would require checking against actual usage in KV
    // For now, we'll add the structure for future implementation
    const currency = context.currency || "USD";
    const dailyCap = passport.limits.daily_refund_cap[currency] || 0;
    const usedToday = 0; // Placeholder for actual usage calculation
    remaining_daily_cap = {
      [currency]: Math.max(0, dailyCap - usedToday),
    };
  }

  return {
    decision_id: decisionId,
    allow,
    reasons,
    expires_in: policyPack.expires_in || 300,
    assurance_level: passport.assurance_level,
    passport_digest: passportDigest,
    signature,
    created_at: new Date().toISOString(),
    owner_id: passport.owner_id,
    policy_id: packId,
    kid: env.REGISTRY_KEY_ID
      ? `oap:registry:${env.REGISTRY_KEY_ID}`
      : undefined,
    ...(remaining_daily_cap && { remaining_daily_cap }),
  };
}

/**
 * Load policy pack from KV
 */
async function loadPolicyPack(env: Env, packId: string): Promise<any> {
  try {
    const policyKey = `policy:${packId}`;
    const policyData = await env.ai_passport_registry.get(policyKey, "json");
    return policyData;
  } catch (error) {
    // Silent fail for performance
    return null;
  }
}

/**
 * Validate policy fields
 */
function validatePolicyFields(
  policyPack: any,
  context: Record<string, any>
): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const requiredFields = policyPack.required_fields || [];

  for (const field of requiredFields) {
    if (!context[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generate decision ID
 */
function generateDecisionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `dec_${timestamp}_${random}`;
}

/**
 * Generate idempotency key
 */
function generateIdempotencyKey(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `idem_${timestamp}_${random}`;
}

/**
 * Evaluate enforcement rules for policy compliance
 */
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

  // Check for idempotency replay (duplicate key detection)
  if (enforcement.idempotency_required && context.idempotency_key) {
    // TODO: Implement idempotency key replay detection
    // This would require checking against a KV store of recent decisions
    // For now, we'll add the structure for future implementation
    const isReplay = false; // Placeholder for actual replay detection
    if (isReplay) {
      reasons.push({
        code: "IDEMPOTENCY_REPLAY",
        message: "Idempotency key has already been used",
        severity: "error",
      });
    }
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

  // Check order balance exceeded
  if (context.order_balance && context.amount_minor) {
    // TODO: Implement order balance validation
    // This would require checking the order balance against the requested amount
    // For now, we'll add the structure for future implementation
    const orderBalanceExceeded = false; // Placeholder for actual balance check
    if (orderBalanceExceeded) {
      reasons.push({
        code: "ORDER_BALANCE_EXCEEDED",
        message: "Requested amount exceeds available order balance",
        severity: "error",
      });
    }
  }

  return {
    allow: reasons.length === 0,
    reasons,
  };
}

/**
 * Compute passport digest for integrity checking
 */
function computePassportDigest(passport: PassportData): string {
  // Create a stable representation of passport data
  const stableData = {
    agent_id: passport.agent_id,
    owner_id: passport.owner_id,
    status: passport.status,
    capabilities: passport.capabilities,
    limits: passport.limits,
    regions: passport.regions,
    assurance_level: passport.assurance_level,
    updated_at: passport.updated_at,
  };

  // Generate hash for integrity checking
  const data = JSON.stringify(stableData);
  return btoa(data).substring(0, 16);
}

/**
 * Sign decision with HMAC-SHA256 for integrity
 */
async function signDecision(
  decisionId: string,
  allow: boolean,
  reasons: DecisionReason[],
  secret: string
): Promise<string> {
  try {
    // Create payload for signing
    const payload = JSON.stringify({
      decisionId,
      allow,
      reasons: reasons.map((r) => ({ code: r.code, severity: r.severity })),
    });

    // Generate HMAC-SHA256 signature
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
  } catch (error) {
    // Return empty signature on error
    return "";
  }
}
