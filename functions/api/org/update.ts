import { cors } from "../../utils/cors";
import { createAdminRateLimiter, RateLimiter } from "../../utils/rate-limit";
import { createLogger } from "../../utils/logger";
import { verifyOrgKey, getOrgActorString } from "../../utils/org-keys";
import {
  computePassportDiffs,
  createAuditAction,
  completeAuditAction,
  storeAuditAction,
  getLastActionHash,
} from "../../utils/audit-trail";
import {
  preSerializePassport,
  invalidateSerializedPassport,
  buildPassportObject,
} from "../../utils/serialization";
import { signPassport } from "../../utils/signing";
import { purgeVerifyCache } from "../../utils/cache-purge";
import {
  KVNamespace,
  R2Bucket,
  PagesFunction,
} from "@cloudflare/workers-types";
import { PassportData } from "../../../types/passport";
import { validateMCPConfig } from "../../utils/mcp-validation";
import { computePassportEvaluation } from "../../utils/policy-evaluation";
import {
  propagateTemplateChanges,
  handleTemplateStatusChange,
} from "../../utils/template-instance";

interface Env {
  ai_passport_registry: KVNamespace;
  AP_VERSION: string;
  ORG_RPM?: string; // Rate limit: requests per minute for org endpoints
  REGISTRY_PRIVATE_KEY?: string; // Ed25519 private key for signing
  REGISTRY_KEY_ID?: string; // Registry key identifier
  PASSPORT_SNAPSHOTS_BUCKET?: R2Bucket; // R2 bucket for fallback snapshots
  APP_BASE_URL?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ZONE_ID?: string;
}

/**
 * components:
 *   schemas:
 *     OrgUpdateRequest:
 *       type: object
 *       required:
 *         - agent_id
 *       properties:
 *         agent_id:
 *           type: string
 *           description: Agent ID to update
 *           example: "ap_128094d3"
 *         status:
 *           type: string
 *           enum: [active, suspended]
 *           description: New status for the agent (only active/suspended allowed)
 *           example: "suspended"
 *         webhook_url:
 *           type: string
 *           description: Webhook URL for notifications
 *           example: "https://example.com/webhook"
 *         email:
 *           type: string
 *           description: Contact email for the agent
 *           example: "contact@example.com"
 *         capabilities:
 *           type: array
 *           description: Capabilities for the agent
 *           example: ["can_create_refunds", "can_create_invoices"]
 *         description:
 *           type: string
 *           description: Description for the agent
 *           example: "This is a description of the agent"
 *     OrgUpdateResponse:
 *       type: object
 *       required:
 *         - ok
 *         - message
 *         - agent_id
 *       properties:
 *         ok:
 *           type: boolean
 *           description: Success status
 *           example: true
 *         message:
 *           type: string
 *           description: Success message
 *           example: "Agent updated successfully"
 *         agent_id:
 *           type: string
 *           description: Agent ID
 *           example: "ap_128094d3"
 *         status:
 *           type: string
 *           description: New status
 *           example: "suspended"
 */

export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const startTime = Date.now();
  const headers = cors(request);
  const logger = createLogger(env.ai_passport_registry);

  // Rate limiting for org endpoints
  const rateLimiter = createAdminRateLimiter(
    env.ai_passport_registry,
    parseInt(env.ORG_RPM || "30") // Lower rate limit for org endpoints
  );

  const clientIP = RateLimiter.getClientIP(request);
  const rateLimitResult = await rateLimiter.checkLimit(clientIP);

  if (!rateLimitResult.allowed) {
    const response = new Response(
      JSON.stringify({
        error: "rate_limit_exceeded",
        message: "Too many org requests. Please try again later.",
        retry_after: rateLimitResult.retryAfter,
      }),
      {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": rateLimitResult.retryAfter?.toString() || "60",
          "x-ratelimit-limit": "30",
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

  // Verify org key authentication
  const auth = request.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    const response = new Response(
      JSON.stringify({ error: "missing_org_key" }),
      {
        status: 401,
        headers: { "content-type": "application/json", ...headers },
      }
    );

    await logger.logRequest(request, response, startTime);
    return response;
  }

  const orgKeySecret = auth.substring(7); // Remove "Bearer " prefix
  const keyId = request.headers.get("x-org-key-id");

  if (!keyId) {
    const response = new Response(
      JSON.stringify({ error: "missing_org_key_id" }),
      {
        status: 401,
        headers: { "content-type": "application/json", ...headers },
      }
    );

    await logger.logRequest(request, response, startTime);
    return response;
  }

  // Verify org key
  const orgKey = await verifyOrgKey(
    env.ai_passport_registry,
    keyId,
    orgKeySecret
  );
  if (!orgKey) {
    const response = new Response(
      JSON.stringify({ error: "invalid_org_key" }),
      {
        status: 401,
        headers: { "content-type": "application/json", ...headers },
      }
    );

    await logger.logRequest(request, response, startTime);
    return response;
  }

  try {
    const body = (await request.json()) as PassportData;

    if (!body.agent_id) {
      const response = new Response(
        JSON.stringify({ error: "missing_agent_id" }),
        {
          status: 400,
          headers: { "content-type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Verify the org key is for this agent
    if (orgKey.agent_id !== body.agent_id) {
      const response = new Response(
        JSON.stringify({ error: "org_key_mismatch" }),
        {
          status: 403,
          headers: { "content-type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Get existing agent
    const agentKey = `passport:${body.agent_id}`;
    const existingAgent = (await env.ai_passport_registry.get(
      agentKey,
      "json"
    )) as PassportData | null;
    if (!existingAgent) {
      const response = new Response(
        JSON.stringify({ error: "agent_not_found" }),
        {
          status: 404,
          headers: { "content-type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Validate status change (only allow active <-> suspended)
    if (
      body.status &&
      body.status !== "active" &&
      body.status !== "suspended"
    ) {
      const response = new Response(
        JSON.stringify({
          error: "invalid_status",
          message:
            "Org keys can only change status between 'active' and 'suspended'",
        }),
        {
          status: 400,
          headers: { "content-type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Validate MCP configuration if provided (future-proofing)
    if ((body as any).mcp) {
      const mcpValidation = validateMCPConfig((body as any).mcp);
      if (!mcpValidation.valid) {
        const response = new Response(
          JSON.stringify({
            error: "bad_request",
            message: `MCP validation failed: ${mcpValidation.errors.join(
              ", "
            )}`,
          }),
          {
            status: 400,
            headers: { "content-type": "application/json", ...headers },
          }
        );
        await logger.logRequest(request, response, startTime);
        return response;
      }
      // Use sanitized MCP data
      (body as any).mcp = mcpValidation.sanitized;
    }

    // Create updated agent data
    const updatedAgent: PassportData = {
      ...existingAgent,
      ...(body.status && { status: body.status }),
      ...(body.webhook_url && { webhook_url: body.webhook_url }),
      ...(body.email && { contact: body.email }),
      updated_at: new Date().toISOString(),
    };

    // Recompute policy evaluation after updates
    try {
      const evaluation = await computePassportEvaluation(
        updatedAgent,
        env.ai_passport_registry
      );
      updatedAgent.evaluation = evaluation;
    } catch (error) {
      console.warn("Failed to recompute policy evaluation:", error);
      // Continue without updating evaluation
    }

    // Sign the passport if status is active
    if (
      body.status === "active" &&
      env.REGISTRY_PRIVATE_KEY &&
      env.REGISTRY_KEY_ID
    ) {
      try {
        const signatureData = await signPassport(
          updatedAgent,
          env.REGISTRY_PRIVATE_KEY,
          env.REGISTRY_KEY_ID
        );

        updatedAgent.registry_key_id = signatureData.registry_key_id;
        updatedAgent.registry_sig = signatureData.registry_sig;
        updatedAgent.canonical_hash = signatureData.canonical_hash;
        updatedAgent.verified_at = signatureData.verified_at;
      } catch (error) {
        console.error("Failed to sign passport:", error);
        // Continue without signature - passport will be updated but unsigned
      }
    }

    // Create audit action for the update
    const changes = computePassportDiffs(existingAgent, updatedAgent);
    const actor = getOrgActorString(orgKey);

    const auditAction = await createAuditAction(
      "update",
      body.agent_id,
      actor,
      changes,
      `Agent updated via org key by ${actor}`
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

    // Update agent, re-serialize, update R2 snapshot, and store Verifiable Attestation
    const updatePromises = [
      env.ai_passport_registry.put(agentKey, JSON.stringify(updatedAgent)),
      // Invalidate and re-serialize for consistency
      invalidateSerializedPassport(env.ai_passport_registry, body.agent_id),
      preSerializePassport(
        env.ai_passport_registry,
        body.agent_id,
        updatedAgent,
        env.AP_VERSION
      ),
      storeAuditAction(env.ai_passport_registry, completedAuditAction),
    ];

    // Add R2 snapshot update if bucket is available
    if (env.PASSPORT_SNAPSHOTS_BUCKET) {
      const passport = buildPassportObject(updatedAgent, env.AP_VERSION);
      const r2Key = `passports/${body.agent_id}.json`;
      updatePromises.push(
        env.PASSPORT_SNAPSHOTS_BUCKET.put(r2Key, JSON.stringify(passport), {
          httpMetadata: {
            contentType: "application/json",
            cacheControl: "public, max-age=300", // 5 minutes cache
          },
        }).then(() => {}) // Convert R2Object to void
      );
    }

    await Promise.all(updatePromises);

    // Handle template propagation if this is a template
    if (updatedAgent.kind === "template") {
      // Propagate capability and description changes to instances
      if (body.capabilities || body.description) {
        const propagationResult = await propagateTemplateChanges(
          env.ai_passport_registry,
          body.agent_id,
          {
            capabilities: body.capabilities,
            description: body.description,
            role: body.role,
            name: body.name,
            logo_url: body.logo_url,
            categories: body.categories,
            framework: body.framework,
            mcp: body.mcp,
            attestations: body.attestations,
          }
        );

        if (propagationResult.updated > 0) {
          console.log(
            `Propagated template changes to ${propagationResult.updated} instances`
          );
        }

        if (propagationResult.errors.length > 0) {
          console.warn(
            "Template propagation errors:",
            propagationResult.errors
          );
        }
      }

      // Handle status change propagation (e.g., revoked -> suspend instances)
      if (body.status) {
        const statusResult = await handleTemplateStatusChange(
          env.ai_passport_registry,
          body.agent_id,
          body.status
        );

        if (statusResult.suspended > 0) {
          console.log(
            `Suspended ${statusResult.suspended} instances due to template status change`
          );
        }

        if (statusResult.errors.length > 0) {
          console.warn("Status propagation errors:", statusResult.errors);
        }
      }
    }

    // Purge verify cache for this agent
    await purgeVerifyCache(
      body.agent_id,
      env.APP_BASE_URL || "https://aport.io",
      env.CLOUDFLARE_API_TOKEN,
      env.CLOUDFLARE_ZONE_ID
    );

    const response = new Response(
      JSON.stringify({
        ok: true,
        message: "Agent updated successfully",
        agent_id: body.agent_id,
        status: updatedAgent.status,
        updated_by: actor,
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-ratelimit-limit": "30",
          "x-ratelimit-remaining": rateLimitResult.remaining.toString(),
          "x-ratelimit-reset": new Date(
            rateLimitResult.resetTime
          ).toISOString(),
          ...headers,
        },
      }
    );

    await logger.logRequest(request, response, startTime);
    return response;
  } catch (error) {
    console.error("Error updating agent via org key:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to update agent",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json", ...headers },
      }
    );

    await logger.logRequest(request, response, startTime);
    return response;
  }
};
