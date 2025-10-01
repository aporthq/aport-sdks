/**
 * Attestation Endpoint for Audit Hash-Chain
 * GET /api/attestation/hashes/{tenant_id}
 *
 * Returns the last N audit hashes for a tenant to enable tampering detection.
 * This endpoint provides cryptographic verification of the Verifiable Attestation integrity.
 */

import { cors } from "../../../utils/cors";
import { createLogger } from "../../../utils/logger";
import { resolveTenantFromOrgId } from "../../../runtime/region";
import { createTenantDOClientFromEnv } from "../../../runtime/TenantDOClient";
import { ErrorHandler } from "../../../utils/error-handler";
import { MultiRegionEnv } from "../../../types/env";
import { PagesFunction } from "@cloudflare/workers-types";

interface Env extends MultiRegionEnv {
  REGISTRY_PRIVATE_KEY?: string;
}

interface AuditHashEntry {
  decision_id: string;
  agent_id: string;
  policy_pack_id: string;
  decision: "allow" | "deny";
  reason: string;
  created_at: string;
  prev_hash: string | null;
  record_hash: string;
  org_id: string;
}

interface AttestationResponse {
  tenant_id: string;
  region: string;
  total_entries: number;
  hashes: AuditHashEntry[];
  chain_integrity: {
    valid: boolean;
    first_hash: string | null;
    last_hash: string | null;
    break_points: number[];
  };
  generated_at: string;
  expires_at: string;
}

/**
 * @swagger
 * /api/attestation/hashes/{tenant_id}:
 *   get:
 *     summary: Get audit hash-chain for tenant
 *     description: Returns the last N audit hashes for a tenant to enable tampering detection
 *     operationId: getAuditHashes
 *     tags:
 *       - Attestation
 *       - Audit
 *     parameters:
 *       - name: tenant_id
 *         in: path
 *         required: true
 *         description: The tenant ID (organization ID)
 *         schema:
 *           type: string
 *           pattern: ^ap_org_
 *           example: "ap_org_acme"
 *       - name: limit
 *         in: query
 *         description: Number of recent hashes to return
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 1000
 *           default: 100
 *           example: 100
 *       - name: agent_id
 *         in: query
 *         description: Filter by specific agent ID
 *         schema:
 *           type: string
 *           example: "ap_123456789"
 *       - name: policy_pack_id
 *         in: query
 *         description: Filter by specific policy pack ID
 *         schema:
 *           type: string
 *           example: "refunds"
 *       - name: since
 *         in: query
 *         description: Only return hashes since this timestamp (ISO 8601)
 *         schema:
 *           type: string
 *           format: date-time
 *           example: "2024-01-01T00:00:00Z"
 *     responses:
 *       200:
 *         description: Audit hash-chain retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tenant_id:
 *                   type: string
 *                   example: "ap_org_acme"
 *                 region:
 *                   type: string
 *                   example: "US"
 *                 total_entries:
 *                   type: integer
 *                   example: 150
 *                 hashes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       decision_id:
 *                         type: string
 *                         example: "dec_1234567890"
 *                       agent_id:
 *                         type: string
 *                         example: "ap_123456789"
 *                       policy_pack_id:
 *                         type: string
 *                         example: "refunds"
 *                       decision:
 *                         type: string
 *                         enum: [allow, deny]
 *                         example: "allow"
 *                       reason:
 *                         type: string
 *                         example: "Within daily limit"
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-01-15T10:30:00Z"
 *                       prev_hash:
 *                         type: string
 *                         nullable: true
 *                         example: "sha256:abc123..."
 *                       record_hash:
 *                         type: string
 *                         example: "sha256:def456..."
 *                       org_id:
 *                         type: string
 *                         example: "ap_org_acme"
 *                 chain_integrity:
 *                   type: object
 *                   properties:
 *                     valid:
 *                       type: boolean
 *                       example: true
 *                     first_hash:
 *                       type: string
 *                       nullable: true
 *                       example: "sha256:abc123..."
 *                     last_hash:
 *                       type: string
 *                       nullable: true
 *                       example: "sha256:def456..."
 *                     break_points:
 *                       type: array
 *                       items:
 *                         type: integer
 *                       example: []
 *                 generated_at:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-01-15T10:30:00Z"
 *                 expires_at:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-01-16T10:30:00Z"
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid tenant ID format"
 *       404:
 *         description: Tenant not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Tenant not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to retrieve audit hashes"
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const startTime = performance.now();
  const requestId = `audit_hashes_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 8)}`;

  // CORS headers
  const corsHeaders = cors(request);

  try {
    const tenantId = params?.tenant_id as string;
    if (!tenantId) {
      return ErrorHandler.createValidationError(
        "Tenant ID is required",
        { requestId },
        requestId
      );
    }

    // Validate tenant ID format
    if (!tenantId.startsWith("ap_org_")) {
      return ErrorHandler.createValidationError(
        "Invalid tenant ID format. Must start with 'ap_org_'",
        { requestId },
        requestId
      );
    }

    // Parse query parameters
    const url = new URL(request.url);
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") || "100"),
      1000
    );
    const agentId = url.searchParams.get("agent_id") || undefined;
    const policyPackId = url.searchParams.get("policy_pack_id") || undefined;
    const since = url.searchParams.get("since") || undefined;

    // Initialize logger
    const logger = createLogger(env.ai_passport_registry);

    // Resolve tenant and get region-specific bindings
    const tenant = await resolveTenantFromOrgId(env, tenantId);
    if (!tenant) {
      return ErrorHandler.createTenantNotFoundError(tenantId, requestId);
    }

    // Create TenantDO client
    const tenantDO = createTenantDOClientFromEnv(env, tenantId, {
      timeout: 10000,
      maxRetries: 3,
    });

    // Initialize tenant with region-specific bindings
    await tenantDO.initializeTenant(tenant);

    // Get audit hashes through TenantDO
    const { hashes: auditHashes, chainIntegrity } =
      await tenantDO.getAuditHashes({
        limit,
        agentId,
        policyPackId,
        since,
      });

    // Prepare response
    const response: AttestationResponse = {
      tenant_id: tenantId,
      region: tenant.region || "US",
      total_entries: auditHashes.length,
      hashes: auditHashes.map((hash) => ({
        decision_id: hash.decision_id,
        agent_id: hash.agent_id,
        policy_pack_id: hash.policy_pack_id,
        decision: hash.decision,
        reason: hash.reason,
        created_at: hash.created_at,
        prev_hash: hash.prev_hash,
        record_hash: hash.record_hash,
        org_id: hash.org_id,
      })),
      chain_integrity: chainIntegrity,
      generated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
    };

    const totalTime = performance.now() - startTime;

    logger.logRequest(request, new Response("OK", { status: 200 }), startTime, {
      clientIP: request.headers.get("CF-Connecting-IP") || "unknown",
      userAgent: request.headers.get("user-agent") || undefined,
      agentId: agentId,
      cfRay: request.headers.get("cf-ray") || undefined,
      isBot: request.headers.get("user-agent")?.includes("bot") || false,
      isBrowser:
        request.headers.get("user-agent")?.includes("Mozilla") || false,
      region: tenant.region,
      latency: totalTime,
    });

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300, s-maxage=600", // 5min cache, 10min CDN
        "X-Request-ID": requestId,
        "X-Total-Entries": auditHashes.length.toString(),
        "X-Chain-Valid": chainIntegrity.valid.toString(),
        "X-Response-Time": `${totalTime.toFixed(2)}ms`,
        ...corsHeaders,
      },
    });
  } catch (error) {
    const logger = createLogger(env.ai_passport_registry);
    await ErrorHandler.logError(
      logger,
      "Error retrieving audit hashes",
      error,
      {
        tenantId: params?.tenant_id,
      }
    );
    return ErrorHandler.createErrorResponse(
      "internal_server_error",
      "Failed to retrieve audit hashes",
      500,
      requestId
    );
  }
};

export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { headers: cors(request) });
