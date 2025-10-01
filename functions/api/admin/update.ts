import { cors } from "../../utils/cors";
import { createAdminRateLimiter, RateLimiter } from "../../utils/rate-limit";
import { createLogger } from "../../utils/logger";
import {
  preSerializePassport,
  invalidateSerializedPassport,
  buildPassportObject,
} from "../../utils/serialization";
import { signPassport } from "../../utils/signing";
import { purgeVerifyCache } from "../../utils/cache-purge";
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
import { PassportCategory, PassportFramework } from "../../utils/taxonomy";
import { validateMCPConfig } from "../../utils/mcp-validation";
import { computePassportEvaluation } from "../../utils/policy-evaluation";
import {
  propagateTemplateChanges,
  handleTemplateStatusChange,
} from "../../utils/template-instance";

/**
 * components:
 *   schemas:
 *     PassportData:
 *       type: object
 *       required:
 *         - agent_id
 *       properties:
 *         agent_id:
 *           type: string
 *           description: Agent ID to update
 *           example: "aeebc92d-13fb-4e23-8c3c-1aa82b167da6"
 *         name:
 *           type: string
 *           description: Updated agent name
 *           example: "Updated Agent Name"
 *         owner:
 *           type: string
 *           description: Updated owner
 *           example: "Updated Corp"
 *         role:
 *           type: string
 *           description: Updated role
 *           example: "Tier-2"
 *         description:
 *           type: string
 *           description: Updated description
 *           example: "Updated description"
 *         permissions:
 *           type: array
 *           items:
 *             type: string
 *           description: Updated permissions
 *           example: ["read:tickets", "create:tickets", "update:tickets"]
 *         limits:
 *           type: object
 *           additionalProperties: true
 *           description: Updated limits
 *           example:
 *             ticket_creation_daily: 50
 *         regions:
 *           type: array
 *           items:
 *             type: string
 *           description: Updated regions
 *           example: ["US-CA", "US-NY", "US-TX"]
 *         contact:
 *           type: string
 *           description: Updated contact
 *           example: "updated@example.com"
 *         links:
 *           type: object
 *           properties:
 *             homepage:
 *               type: string
 *             docs:
 *               type: string
 *             repo:
 *               type: string
 *           description: Updated links
 *         framework:
 *           type: array
 *           items:
 *             type: string
 *           description: Updated framework
 *           example: ["react", "nextjs"]
 *         categories:
 *           type: array
 *           items:
 *             type: string
 *           description: Updated categories
 *           example: ["customer-service", "support"]
 *         logo_url:
 *           type: string
 *           description: Updated logo URL
 *           example: "https://example.com/logo.png"
 *     UpdatePassportResponse:
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
 *           example: "Agent passport updated successfully"
 *         agent_id:
 *           type: string
 *           description: Updated agent ID
 *           example: "aeebc92d-13fb-4e23-8c3c-1aa82b167da6"
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

/**
 * Generate URL-friendly slug from name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .substring(0, 50);
}

/**
 * Normalize name for uniqueness checking (best-effort)
 */
function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ").substring(0, 100);
}

/**
 * Find unique slug by checking for collisions and appending -2, -3, etc.
 */
async function findUniqueSlug(
  baseSlug: string,
  kv: KVNamespace,
  excludeAgentId?: string
): Promise<string> {
  let slug = baseSlug;
  let counter = 2;

  while (true) {
    const indexKey = `index:slug:${slug}`;
    const existingAgentId = await kv.get(indexKey);

    // If no collision or it's the same agent (for updates), we're good
    if (!existingAgentId || existingAgentId === excludeAgentId) {
      return slug;
    }

    // Try with counter suffix
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
}

/**
 * Check if normalized name is unique (best-effort)
 */
async function isNameUnique(
  normalizedName: string,
  kv: KVNamespace,
  excludeAgentId?: string
): Promise<boolean> {
  const indexKey = `index:name:${normalizedName}`;
  const existingAgentId = await kv.get(indexKey);

  // If no collision or it's the same agent (for updates), it's unique
  return !existingAgentId || existingAgentId === excludeAgentId;
}

/**
 * Create or update index entries atomically
 */
async function updateIndexes(
  kv: KVNamespace,
  agentId: string,
  slug: string,
  normalizedName: string,
  oldSlug?: string,
  oldNormalizedName?: string
): Promise<void> {
  const operations: Promise<any>[] = [];

  // Remove old indexes if they exist
  if (oldSlug) {
    operations.push(kv.delete(`index:slug:${oldSlug}`));
  }
  if (oldNormalizedName) {
    operations.push(kv.delete(`index:name:${oldNormalizedName}`));
  }

  // Add new indexes
  operations.push(kv.put(`index:slug:${slug}`, agentId));
  operations.push(kv.put(`index:name:${normalizedName}`, agentId));

  // Execute all operations in parallel
  await Promise.all(operations);
}

/**
 * /api/admin/update:
 *   patch:
 *     summary: Update an existing agent passport
 *     description: Update fields of an existing AI agent passport (admin only)
 *     operationId: updateAgent
 *     tags:
 *       - Admin
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PassportData'
 *           example:
 *             agent_id: "aeebc92d-13fb-4e23-8c3c-1aa82b167da6"
 *             name: "Updated Agent Name"
 *             role: "Tier-2"
 *             description: "Updated description"
 *             permissions: ["read:tickets", "create:tickets", "update:tickets"]
 *     responses:
 *       200:
 *         description: Agent passport updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UpdatePassportResponse'
 *             example:
 *               ok: true
 *               message: "Agent passport updated successfully"
 *               agent_id: "aeebc92d-13fb-4e23-8c3c-1aa82b167da6"
 *       400:
 *         description: Invalid request data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "bad_request"
 *               message: "Missing agent_id"
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
 *               message: "Failed to update agent passport"
 */
export const onRequestOptions: PagesFunction<Env> = async ({ request }) => {
  const headers = cors(request as Request);
  return new Response(null, { headers });
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
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
    const body = (await request.json().catch(() => ({}))) as PassportData;

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

    // Validate MCP configuration if provided
    if (body.mcp) {
      const mcpValidation = validateMCPConfig(body.mcp);
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
      body.mcp = mcpValidation.sanitized;
    }

    // Update fields
    const updatedPassport: PassportData = {
      ...existingPassport,
      ...body,
      updated_at: new Date().toISOString(),
    };

    // Recompute policy evaluation after updates
    try {
      const evaluation = await computePassportEvaluation(
        updatedPassport,
        env.ai_passport_registry
      );
      updatedPassport.evaluation = evaluation;
    } catch (error) {
      console.warn("Failed to recompute policy evaluation:", error);
      // Continue without updating evaluation
    }

    // Handle slug and name updates
    let newSlug = existingPassport.slug;
    let newNormalizedName = normalizeName(existingPassport.name);

    if (body.name && body.name !== existingPassport.name) {
      const baseSlug = generateSlug(body.name);
      newSlug = await findUniqueSlug(
        baseSlug,
        env.ai_passport_registry,
        body.agent_id
      );
      newNormalizedName = normalizeName(body.name);
      updatedPassport.slug = newSlug;
    }

    // Check name uniqueness if name changed
    if (body.name && body.name !== existingPassport.name) {
      const nameIsUnique = await isNameUnique(
        newNormalizedName,
        env.ai_passport_registry,
        body.agent_id
      );
      if (!nameIsUnique) {
        console.log(
          `Warning: Name "${body.name}" is not unique, but allowing update (best-effort)`
        );
      }
    }

    // Sign the passport if it's being set to active and we have signing keys
    if (
      (body as any).status === "active" &&
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

    // Create audit action for the update
    const changes = computePassportDiffs(existingPassport, updatedPassport);
    const auditAction = await createAuditAction(
      "update",
      body.agent_id,
      "admin", // TODO: Get actual admin user from request
      changes,
      "Agent passport updated via admin interface"
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

    // Use unified passport update optimizer for optimized update
    const { createPassportUpdateOptimizer } = await import(
      "../../utils/passport-update-optimizer"
    );
    const updateOptimizer = createPassportUpdateOptimizer(
      env.ai_passport_registry,
      env.AP_VERSION || "0.1",
      env.PASSPORT_SNAPSHOTS_BUCKET // R2 bucket for backups
    );

    // Update passport with backup (this handles KV storage, cache invalidation, and backup)
    const updateResult = await updateOptimizer.updatePassport(
      body.agent_id,
      updatedPassport,
      existingPassport,
      {
        createBackup: true,
        invalidateCache: true,
        preWarmCache: true,
        reason: "Passport updated via admin interface",
        actor: "admin",
      }
    );

    // Additional admin-specific operations in parallel
    const updatePromises = [
      // Update indexes
      updateIndexes(
        env.ai_passport_registry,
        body.agent_id,
        newSlug,
        newNormalizedName,
        existingPassport.slug,
        normalizeName(existingPassport.name)
      ),
      // Re-serialize for edge performance (optimizer already invalidated cache)
      preSerializePassport(
        env.ai_passport_registry,
        body.agent_id,
        updatedPassport,
        env.AP_VERSION
      ),
      // Store audit action
      storeAuditAction(env.ai_passport_registry, completedAuditAction),
      // Create R2 snapshot (separate from backup)
      ...(env.PASSPORT_SNAPSHOTS_BUCKET
        ? [
            env.PASSPORT_SNAPSHOTS_BUCKET.put(
              `passports/${body.agent_id}.json`,
              JSON.stringify(updatedPassport),
              {
                httpMetadata: {
                  contentType: "application/json",
                  cacheControl: "public, max-age=300", // 5 minutes cache
                },
              }
            ).then(() => {}),
          ]
        : []),
    ];

    await Promise.all(updatePromises);

    // Handle template propagation if this is a template
    if (updatedPassport.kind === "template") {
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
        message: "Agent passport updated successfully",
        agent_id: body.agent_id,
        updated_at: updateResult.updatedAt,
        latency: updateResult.latency,
        cache_invalidated: updateResult.cacheInvalidated,
        backup_created: updateResult.backupCreated,
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
    console.error("Error updating passport:", error);
    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to update agent passport",
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
