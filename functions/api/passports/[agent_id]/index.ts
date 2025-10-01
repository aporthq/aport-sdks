/**
 * @swagger
 * /api/passports/{agent_id}:
 *   get:
 *     summary: Get passport details
 *     description: Retrieves detailed information about a specific agent passport by agent ID. Supports user, organization, and admin access.
 *     operationId: getPassportDetails
 *     tags:
 *       - Passports
 *       - Agent Management
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: agent_id
 *         required: true
 *         schema:
 *           type: string
 *           pattern: "^ap_[a-zA-Z0-9_-]+$"
 *         description: Unique agent identifier
 *         example: "ap_agent_123456789"
 *     responses:
 *       200:
 *         description: Passport details retrieved successfully
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
 *                   $ref: '#/components/schemas/Passport'
 *                 requestId:
 *                   type: string
 *                   description: Unique request identifier
 *                   example: "req_123456789"
 *       400:
 *         description: Bad request - invalid agent ID
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "invalid_agent_id"
 *               message: "Agent ID must start with 'ap_'"
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
 *         description: Forbidden - insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "forbidden"
 *               message: "You don't have permission to access this passport"
 *       404:
 *         description: Passport not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "passport_not_found"
 *               message: "Passport with the specified agent ID was not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { createLogger } from "../../../utils/logger";
import { authMiddleware, AuthResult } from "../../../utils/auth-middleware";
import {
  canAccessResource,
  createAuthErrorResponse,
  createSuccessResponse,
} from "../../../utils/general-auth";
import {
  ValidationUtils,
  ERROR_MESSAGES,
  ApiResponse,
  HTTP_STATUS,
} from "../../../utils/api-response";
import { cors } from "../../../utils/cors";
import { createCache } from "../../../utils/cache";
import { createVerifyRateLimiter } from "../../../utils/rate-limit";
import { RateLimiter } from "../../../utils/rate-limit";
import { PagesFunction } from "@cloudflare/workers-types";

// ============================================================================
// Request/Response Types
// ============================================================================

interface GetPassportResponse {
  success: boolean;
  data?: any;
  error?: string;
  requestId: string;
}

// ============================================================================
// Handler
// ============================================================================

export const onRequestOptions: PagesFunction<any> = async ({ request }) => {
  return new Response(null, {
    status: 200,
    headers: cors(request),
  });
};

export const onRequestGet: PagesFunction<any> = async ({
  request,
  env,
  params,
}) => {
  console.log("GET /api/passports/[agent_id] endpoint called");

  const requestId = `req_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;

  // Initialize logger and cache
  const logger = createLogger(env.ai_passport_registry);
  const cache = createCache(env);
  const rateLimiter = createVerifyRateLimiter(env.ai_passport_registry);

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

    // Rate limiting
    const clientIP = RateLimiter.getClientIP(request);
    const rateLimitResult = await rateLimiter.checkLimit(clientIP);
    if (!rateLimitResult.allowed) {
      return response.error(
        {
          error: "rate_limit_exceeded",
          message: "Rate limit exceeded",
          retry_after: rateLimitResult.retryAfter,
          details: { requestId },
        },
        429
      );
    }

    // Extract agent ID from path parameters
    const agentId = params.agent_id as string;
    if (!agentId) {
      return response.badRequest(
        "Missing required parameter: agent_id",
        ["agent_id"],
        { requestId }
      );
    }

    // Validate agent ID format
    if (!agentId.startsWith("ap_")) {
      return response.badRequest(
        "Agent ID must start with 'ap_'",
        ["agent_id"],
        { requestId }
      );
    }

    // Authenticate request (supports cookies, JWT, API keys, and admin tokens)
    const authResult: AuthResult = await authMiddleware(request, env as any, {
      requireAuth: true,
      allowApiKey: true,
      requiredApiKeyScopes: ["read"],
    });

    if (!authResult.success) {
      return response.error(
        {
          error: "unauthorized",
          message: authResult.error!,
          details: { requestId },
        },
        authResult.statusCode || 401
      );
    }

    // Check if user is admin
    const isAdmin =
      authResult.user?.platform_roles?.includes("registry_admin") || false;

    // Fetch passport data
    const passportData = await env.ai_passport_registry.get(
      `passport:${agentId}`,
      "json"
    );

    if (!passportData) {
      return response.error(
        {
          error: "passport_not_found",
          message: "Passport with the specified agent ID was not found",
          details: { requestId, agent_id: agentId },
        },
        404
      );
    }

    const passport = passportData as any;

    // Check access permissions for non-admin users
    if (!isAdmin) {
      const resourceCheck = canAccessResource(authResult.user!, {
        resourceOwnerId: passport.owner_id,
        operation: "read",
        allowSelfAccess: true,
        allowOrgAccess: true,
        allowAdminAccess: false,
      });

      if (!resourceCheck.allowed) {
        return response.error(
          {
            error: "forbidden",
            message: "You don't have permission to access this passport",
            details: { requestId, agent_id: agentId },
          },
          403
        );
      }
    }

    // Build complete passport response
    const passportResponse = {
      // Core Identity
      agent_id: passport.agent_id,
      slug: passport.slug,
      name: passport.name,
      owner_id: passport.owner_id,
      owner_type: passport.owner_type,
      owner_display: passport.owner_display,
      controller_type: passport.controller_type,
      claimed: passport.claimed,
      spec_version: passport.spec_version,

      // Agent Details
      role: passport.role,
      description: passport.description,
      capabilities: passport.capabilities || [],
      limits: passport.limits || {},
      regions: passport.regions || [],

      // Status & Verification
      status: passport.status,
      verification_status: passport.verification_status,
      verification_method: passport.verification_method,
      verification_evidence: passport.verification_evidence || {},

      // Assurance
      assurance_level: passport.assurance_level,
      assurance_method: passport.assurance_method,
      assurance_verified_at: passport.assurance_verified_at,

      // Contact & Links
      contact: passport.contact,
      links: passport.links || { homepage: "", docs: "", repo: "" },

      // Categorization & Metadata
      categories: passport.categories || passport.controlled_categories || [],
      framework: passport.framework || passport.controlled_framework || [],
      logo_url: passport.logo_url,

      // System Metadata
      source: passport.source,
      created_at: passport.created_at,
      updated_at: passport.updated_at,
      version: passport.version,
      version_number: passport.version_number,

      // Issuance & Delegation
      issuer_type: passport.issuer_type,
      issued_by: passport.issued_by,
      provisioned_by_org_id: passport.provisioned_by_org_id,
      pending_owner: passport.pending_owner,
      sponsor_orgs: passport.sponsor_orgs || [],

      // Registry Signature
      registry_key_id: passport.registry_key_id,
      registry_sig: passport.registry_sig,
      canonical_hash: passport.canonical_hash,
      verified_at: passport.verified_at,

      // MCP Support
      mcp: passport.mcp,

      // Policy Evaluation
      evaluation: passport.evaluation,

      // Attestations
      attestations: passport.attestations || [],

      // Additional fields
      kind: passport.kind,
      creator_id: passport.creator_id,
      creator_type: passport.creator_type,

      // Template/Instance fields
      template_id: passport.template_id,
      instance_overrides: passport.instance_overrides,

      // Admin fields (only included for admin users)
      ...(isAdmin && {
        admin_notes: passport.admin_notes,
        internal_metadata: passport.internal_metadata,
        audit_trail: passport.audit_trail,
      }),
    };

    // Return success response
    const responseData = {
      success: true,
      data: passportResponse,
      requestId,
    };

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...cors(request),
      },
    });
  } catch (error) {
    console.log("Passport retrieval failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      requestId,
      agent_id: params.agent_id,
    });

    return response.error(
      {
        error: "internal_server_error",
        message: error instanceof Error ? error.message : "Unknown error",
        details: { requestId },
      },
      500
    );
  }
};
