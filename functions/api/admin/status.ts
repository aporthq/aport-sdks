import { cors } from "../../utils/cors";
import { createAdminRateLimiter, RateLimiter } from "../../utils/rate-limit";
import { createLogger } from "../../utils/logger";
import {
  preSerializePassport,
  invalidateSerializedPassport,
  buildPassportObject,
} from "../../utils/serialization";
import { purgeVerifyCache } from "../../utils/cache-purge";
import { signPassport } from "../../utils/signing";
import {
  computePassportDiffs,
  createAuditAction,
  completeAuditAction,
  storeAuditAction,
  getLastActionHash,
} from "../../utils/audit-trail";
import {
  KVNamespace,
  R2Bucket,
  PagesFunction,
} from "@cloudflare/workers-types";
import { PassportData } from "../../../types/passport";

/**
 * components:
 *   schemas:
 *     UpdateStatusRequest:
 *       type: object
 *       required:
 *         - agent_id
 *         - status
 *       properties:
 *         agent_id:
 *           type: string
 *           description: Agent ID to update
 *           example: "ap_128094d3"
 *         status:
 *           type: string
 *           enum: [draft, active, suspended, revoked]
 *           description: New status for the agent
 *           example: "suspended"
 *     UpdateStatusResponse:
 *       type: object
 *       required:
 *         - ok
 *         - message
 *         - agent_id
 *         - status
 *       properties:
 *         ok:
 *           type: boolean
 *           description: Success status
 *           example: true
 *         message:
 *           type: string
 *           description: Success message
 *           example: "Agent status updated successfully"
 *         agent_id:
 *           type: string
 *           description: Updated agent ID
 *           example: "ap_128094d3"
 *         status:
 *           type: string
 *           description: New status
 *           example: "suspended"
 */

interface Env {
  ai_passport_registry: KVNamespace;
  ADMIN_TOKEN: string;
  AP_VERSION: string;
  ADMIN_RPM?: string;
  REGISTRY_PRIVATE_KEY?: string; // Ed25519 private key for signing
  REGISTRY_KEY_ID?: string; // Registry key identifier
  PASSPORT_SNAPSHOTS_BUCKET?: R2Bucket; // R2 bucket for fallback snapshots
  APP_BASE_URL?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ZONE_ID?: string;
}

interface UpdateStatusRequest {
  agent_id: string;
  status: "draft" | "active" | "suspended" | "revoked";
}

/**
 * /api/admin/status:
 *   post:
 *     summary: Update agent status
 *     description: Update the status of an existing AI agent passport (admin only)
 *     operationId: updateAgentStatus
 *     tags:
 *       - Admin
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateStatusRequest'
 *           example:
 *             agent_id: "ap_128094d3"
 *             status: "suspended"
 *     responses:
 *       200:
 *         description: Agent status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UpdateStatusResponse'
 *             example:
 *               ok: true
 *               message: "Agent status updated successfully"
 *               agent_id: "ap_128094d3"
 *               status: "suspended"
 *       400:
 *         description: Invalid request data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "bad_request"
 *               message: "Invalid status. Must be one of: draft, active, suspended, revoked"
 *       401:
 *         description: Unauthorized - invalid admin token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "unauthorized"
 *       404:
 *         description: Agent passport not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "not_found"
 *               message: "Agent passport not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "internal_server_error"
 *               message: "Failed to update agent status"
 */
export const onRequestOptions: PagesFunction<Env> = async ({ request }) => {
  const headers = cors(request as Request);
  return new Response(null, { headers });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const startTime = Date.now();
  const headers = cors(request as Request);
  const logger = createLogger(env.ai_passport_registry);

  // Rate limiting for admin endpoints
  const rateLimiter = createAdminRateLimiter(
    env.ai_passport_registry,
    parseInt(env.ADMIN_RPM || "100")
  );

  const clientIP = RateLimiter.getClientIP(request);
  const rateLimitResult = await rateLimiter.checkLimit(clientIP);

  if (!rateLimitResult.allowed) {
    const response = new Response(
      JSON.stringify({
        error: "rate_limit_exceeded",
        message: "Too many admin requests. Please try again later.",
        retry_after: rateLimitResult.retryAfter,
      }),
      {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": rateLimitResult.retryAfter?.toString() || "60",
          "x-ratelimit-limit": "100",
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": new Date(
            rateLimitResult.resetTime
          ).toISOString(),
          ...headers,
        },
      }
    );

    await logger.logRequest(request, response, startTime);
    return response;
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env.ADMIN_TOKEN}`) {
    const response = new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json", ...headers },
    });

    await logger.logRequest(request, response, startTime);
    return response;
  }

  try {
    const body = (await request
      .json()
      .catch(() => ({}))) as UpdateStatusRequest;

    // Validate required fields
    if (!body.agent_id) {
      const response = new Response(
        JSON.stringify({
          error: "bad_request",
          message: "Missing required field: agent_id",
        }),
        {
          status: 400,
          headers: { "content-type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    if (!body.status) {
      const response = new Response(
        JSON.stringify({
          error: "bad_request",
          message: "Missing required field: status",
        }),
        {
          status: 400,
          headers: { "content-type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Validate status
    if (!["draft", "active", "suspended", "revoked"].includes(body.status)) {
      const response = new Response(
        JSON.stringify({
          error: "bad_request",
          message:
            "Invalid status. Must be one of: draft, active, suspended, revoked",
        }),
        {
          status: 400,
          headers: { "content-type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    const key = `passport:${body.agent_id}`;

    // Get existing passport
    const existingPassport = (await env.ai_passport_registry.get(
      key,
      "json"
    )) as PassportData;
    if (!existingPassport) {
      const response = new Response(
        JSON.stringify({
          error: "not_found",
          message: "Agent passport not found",
        }),
        {
          status: 404,
          headers: { "content-type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Update status
    const updatedPassport: PassportData = {
      ...existingPassport,
      status: body.status,
      updated_at: new Date().toISOString(),
    };

    // Sign the passport if transitioning to active and we have signing keys
    if (
      body.status === "active" &&
      env.REGISTRY_PRIVATE_KEY &&
      env.REGISTRY_KEY_ID
    ) {
      try {
        const signatureData = await signPassport(
          updatedPassport,
          env.REGISTRY_PRIVATE_KEY,
          env.REGISTRY_KEY_ID
        );

        // Add signature fields to passport data
        updatedPassport.registry_key_id = signatureData.registry_key_id;
        updatedPassport.registry_sig = signatureData.registry_sig;
        updatedPassport.canonical_hash = signatureData.canonical_hash;
        updatedPassport.verified_at = signatureData.verified_at;
      } catch (error) {
        console.error("Failed to sign passport:", error);
        // Continue without signature - passport will be updated but unsigned
      }
    }

    // Create audit action for the status change
    const changes = computePassportDiffs(existingPassport, updatedPassport);
    const auditAction = await createAuditAction(
      "status_change",
      body.agent_id,
      "admin", // TODO: Get actual admin user from request
      changes,
      `Status changed from ${existingPassport.status} to ${body.status} via admin interface`
    );

    // Get previous action hash for chaining
    const prevHash = await getLastActionHash(
      env.ai_passport_registry,
      body.agent_id
    );

    // Complete audit action with hash-chain and signature
    const completedAuditAction = await completeAuditAction(
      auditAction,
      prevHash,
      env.REGISTRY_PRIVATE_KEY
    );

    // Use unified passport update optimizer for <10ms response
    const { createPassportUpdateOptimizer } = await import(
      "../../utils/passport-update-optimizer"
    );
    const updateOptimizer = createPassportUpdateOptimizer(
      env.ai_passport_registry,
      env.AP_VERSION || "0.1",
      env.PASSPORT_SNAPSHOTS_BUCKET // R2 bucket for backups
    );

    // Execute optimized status change operation
    const statusResult = await updateOptimizer.changeStatus(
      body.agent_id,
      body.status as "active" | "suspended",
      existingPassport.status,
      existingPassport.owner_id,
      {
        createBackup: true,
        invalidateCache: true,
        preWarmCache: true,
        reason: `Status changed from ${existingPassport.status} to ${body.status} via admin interface`,
        actor: "admin",
      }
    );

    // Store audit action in parallel (non-blocking)
    Promise.resolve().then(async () => {
      try {
        await storeAuditAction(env.ai_passport_registry, completedAuditAction);

        // Add R2 snapshot update if bucket is available (background)
        if (env.PASSPORT_SNAPSHOTS_BUCKET) {
          const serializedPassport = JSON.stringify(updatedPassport);
          await env.PASSPORT_SNAPSHOTS_BUCKET.put(
            `passports/${body.agent_id}.json`,
            serializedPassport,
            {
              httpMetadata: {
                contentType: "application/json",
                cacheControl: "public, max-age=300", // 5 minutes cache
              },
            }
          );
        }
      } catch (error) {
        console.warn("Failed to store audit action or R2 snapshot:", error);
      }
    });

    const response = new Response(
      JSON.stringify({
        ok: true,
        message: "Agent status updated successfully",
        agent_id: body.agent_id,
        status: body.status,
        previous_status: existingPassport.status,
        updated_at: statusResult.updatedAt,
        latency: statusResult.latency,
        cache_invalidated: statusResult.cacheInvalidated,
        backup_created: statusResult.backupCreated,
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-ratelimit-limit": "100",
          "x-ratelimit-remaining": rateLimitResult.remaining.toString(),
          "x-ratelimit-reset": new Date(
            rateLimitResult.resetTime
          ).toISOString(),
          ...headers,
        },
      }
    );

    await logger.logRequest(request, response, startTime, {
      agentId: body.agent_id,
    });
    return response;
  } catch (error) {
    console.error("Error updating agent status:", error);
    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to update agent status",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json", ...headers },
      }
    );

    await logger.logError(request, error as Error);
    return response;
  }
};
