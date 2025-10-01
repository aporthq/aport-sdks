/**
 * @swagger
 * /api/passports/list:
 *   get:
 *     summary: List agent passports
 *     description: Lists agent passports for the authenticated user/organization. Admin users can list all passports in the database.
 *     operationId: listPassports
 *     tags:
 *       - Passports
 *       - Agent Management
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: owner_id
 *         schema:
 *           type: string
 *         description: Filter by specific owner ID (admin only)
 *         example: "ap_user_123"
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, suspended, draft, revoked]
 *         description: Filter by passport status
 *         example: "active"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Maximum number of passports to return
 *         example: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of passports to skip
 *         example: 0
 *     responses:
 *       200:
 *         description: Passports retrieved successfully
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
 *                   properties:
 *                     passports:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Passport'
 *                     total:
 *                       type: integer
 *                       description: Total number of passports matching filters
 *                       example: 25
 *                     limit:
 *                       type: integer
 *                       description: Maximum number of passports returned
 *                       example: 20
 *                     offset:
 *                       type: integer
 *                       description: Number of passports skipped
 *                       example: 0
 *                 requestId:
 *                   type: string
 *                   description: Unique request identifier
 *                   example: "req_123456789"
 *       400:
 *         description: Bad request - invalid parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized - invalid or missing authentication
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { createLogger } from "../../utils/logger";
import { authMiddleware, AuthResult } from "../../utils/auth-middleware";
import {
  canAccessResource,
  extractOwnerId,
  createAuthErrorResponse,
  createSuccessResponse,
} from "../../utils/general-auth";
import {
  ValidationUtils,
  ERROR_MESSAGES,
  ApiResponse,
  HTTP_STATUS,
} from "../../utils/api-response";
import { cors } from "../../utils/cors";
import { createCache } from "../../utils/cache";
import { createVerifyRateLimiter } from "../../utils/rate-limit";
import { RateLimiter } from "../../utils/rate-limit";
import { PagesFunction } from "@cloudflare/workers-types";
import { createKVResolver, getKVForOwner } from "../../utils/kv-resolver";
import {
  resolveTenantFromOrgId,
  resolveBindingsFromOrgId,
  resolveTenantBindings,
} from "../../runtime/region";

// ============================================================================
// Request/Response Types
// ============================================================================

interface ListPassportsQuery {
  owner_id?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

interface ListPassportsResponse {
  success: boolean;
  data?: {
    passports: any[];
    total: number;
    limit: number;
    offset: number;
  };
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

export const onRequestGet: PagesFunction<any> = async ({ request, env }) => {
  console.log("GET /api/passports/list endpoint called");

  const requestId = `req_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;

  // Initialize KV resolver for multi-region/multi-tenant support
  const kvResolver = createKVResolver(env);

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

    // Parse query parameters
    const url = new URL(request.url);
    const query: ListPassportsQuery = {
      owner_id: url.searchParams.get("owner_id") || undefined,
      status: url.searchParams.get("status") || undefined,
      limit: parseInt(url.searchParams.get("limit") || "50"),
      offset: parseInt(url.searchParams.get("offset") || "0"),
    };

    // Validate query parameters
    if (query.limit && (query.limit < 1 || query.limit > 100)) {
      return response.badRequest("Limit must be between 1 and 100", ["limit"], {
        requestId,
      });
    }

    if (query.offset && query.offset < 0) {
      return response.badRequest("Offset must be non-negative", ["offset"], {
        requestId,
      });
    }

    if (
      query.status &&
      !["active", "suspended", "draft", "revoked"].includes(query.status)
    ) {
      return response.badRequest(
        "Status must be one of: active, suspended, draft, revoked",
        ["status"],
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

    const tenant = await resolveTenantFromOrgId(env, query?.owner_id || "");
    const bindings = resolveTenantBindings(env, tenant);

    // Determine which owner IDs to query
    let ownerIds: string[] = [];
    let kv: any = bindings.kv || env.ai_passport_registry;

    if (query.owner_id) {
      // Specific owner requested - validate and use it
      if (!ValidationUtils.validateOwnerId(query.owner_id)) {
        return response.badRequest(
          ERROR_MESSAGES.INVALID_OWNER_ID,
          ["owner_id"],
          { requestId }
        );
      }

      // Check if user has access to this owner
      if (!isAdmin) {
        const resourceCheck = canAccessResource(authResult.user!, {
          resourceOwnerId: query.owner_id,
          operation: "read",
          allowSelfAccess: true,
          allowOrgAccess: true,
          allowAdminAccess: false,
        });

        if (!resourceCheck.allowed) {
          return response.error(
            {
              error: "forbidden",
              message:
                "You don't have permission to access this owner's passports",
              details: { requestId },
            },
            403
          );
        }
      }

      // Resolve tenant and region for this owner - use same method as create endpoint
      const tenant = await resolveTenantFromOrgId(env, query.owner_id);
      const bindings = resolveTenantBindings(env, tenant);
      kv = bindings.kv || env.ai_passport_registry;

      console.log("List endpoint KV resolution:", {
        ownerId: query.owner_id,
        bindingsKV: bindings.kv,
        defaultKV: env.ai_passport_registry,
        usingKV: kv,
        isDefault: kv === env.ai_passport_registry,
        bindingsRegion: bindings.region,
      });

      ownerIds = [query.owner_id];
    } else if (isAdmin) {
      // Admin can query all passports - get all owner IDs from indexes
      const allOwnersKey = "all_owners";
      const allOwnersData = await env.ai_passport_registry.get(
        allOwnersKey,
        "json"
      );
      ownerIds = (allOwnersData as string[]) || [];

      // If no all_owners index exists, fall back to scanning for owner_agents:* keys
      if (ownerIds.length === 0) {
        console.log(
          "No all_owners index found, scanning for owner_agents keys"
        );
        // This is a fallback - in production you'd want to maintain the all_owners index
        // For now, we'll return empty results for admin users if no index exists
        ownerIds = [];
      }
    } else {
      // Regular user - only their own passports
      // Get user's own owner ID from auth context - construct with proper prefix
      const userOwnerId = authResult.user!.user.user_id;
      if (userOwnerId) {
        // Ensure the owner ID has the proper prefix
        const prefixedOwnerId = userOwnerId.startsWith("ap_user_")
          ? userOwnerId
          : `ap_user_${userOwnerId}`;
        ownerIds.push(prefixedOwnerId);
      }

      // Check if user has org access - get org IDs from auth context
      const orgIds = Object.keys(authResult.user!.org_roles || {});
      ownerIds.push(...orgIds);

      // For regular users, we need to resolve the KV for each owner
      // Use the first owner ID to determine the KV namespace - use same method as create endpoint
      if (ownerIds.length > 0) {
        const firstOwnerId = ownerIds[0];
        const tenant = await resolveTenantFromOrgId(env, firstOwnerId);
        const bindings = resolveTenantBindings(env, tenant);
        kv = bindings.kv || env.ai_passport_registry;
      }
    }

    // Get all passports for the determined owner IDs
    const allPassports: any[] = [];

    console.log("Owner IDs to query:", ownerIds);
    console.log("Is admin:", isAdmin);
    console.log("Using KV namespace:", kv);
    console.log("Default KV namespace:", env.ai_passport_registry);
    console.log("Query parameters:", query);
    console.log("Status filter:", query.status || "none");
    console.log(
      "List endpoint - Searching for owner IDs:",
      ownerIds.map((id) => ({ ownerId: id, type: typeof id }))
    );
    console.log(
      "Auth result user:",
      authResult.user
        ? {
            user_id: authResult.user.user?.user_id,
            email: authResult.user.user?.email,
            org_roles: Object.keys(authResult.user.org_roles || {}),
          }
        : "No user"
    );

    for (const ownerId of ownerIds) {
      try {
        // For multi-tenant/multi-region, resolve KV for each owner - use same method as create endpoint
        let ownerKV = kv;
        if (ownerId !== ownerIds[0]) {
          // Different owner might be in different region/tenant
          const tenant = await resolveTenantFromOrgId(env, ownerId);
          const bindings = resolveTenantBindings(env, tenant);
          ownerKV = bindings.kv || env.ai_passport_registry;
        }

        // Get owner's passports from index
        const indexKey = `owner_agents:${ownerId}`;
        console.log(`List endpoint - Checking index for owner ${ownerId}:`, {
          ownerId,
          indexKey,
          ownerKV,
          isDefaultKV: ownerKV === env.ai_passport_registry,
        });

        const indexData = await ownerKV.get(indexKey, "json");
        let agentIds = (indexData as string[]) || [];

        console.log(`List endpoint - Index data for ${ownerId}:`, {
          ownerId,
          indexKey,
          indexData,
          agentIds,
          agentCount: agentIds.length,
        });

        console.log(`Index key: ${indexKey}, Agent IDs:`, agentIds);
        console.log(`Using KV namespace for owner ${ownerId}:`, ownerKV);

        // Debug: Check if the index exists in the default namespace too
        if (ownerKV !== env.ai_passport_registry) {
          const defaultIndexData = await env.ai_passport_registry.get(
            indexKey,
            "json"
          );
          console.log(
            `Default namespace index data for ${indexKey}:`,
            defaultIndexData
          );

          // If the resolved KV has no data but default does, use default
          if (
            agentIds.length === 0 &&
            defaultIndexData &&
            Array.isArray(defaultIndexData) &&
            defaultIndexData.length > 0
          ) {
            console.log(
              "Resolved KV has no data, falling back to default namespace"
            );
            console.log("Default namespace has data:", defaultIndexData);
            ownerKV = env.ai_passport_registry;
            agentIds = defaultIndexData;
            console.log("After fallback - ownerKV:", ownerKV);
            console.log("After fallback - agentIds:", agentIds);
          }
        }

        // Debug: Check if the passport exists in the KV we're using
        if (agentIds.length > 0) {
          const firstAgentId = agentIds[0];
          const passportKey = `passport:${firstAgentId}`;
          const passportData = await ownerKV.get(passportKey, "json");
          console.log(
            `Passport data for ${firstAgentId} in ${
              ownerKV === env.ai_passport_registry ? "default" : "resolved"
            } KV:`,
            !!passportData
          );
          if (passportData) {
            console.log(
              `Passport name: ${passportData.name}, status: ${passportData.status}`
            );
          }
        }

        // Fetch passport data
        for (const agentId of agentIds) {
          try {
            const passportData = await ownerKV.get(
              `passport:${agentId}`,
              "json"
            );
            if (passportData) {
              const passport = passportData as any;
              console.log(`Retrieved passport data for ${passport.agent_id}:`, {
                agent_id: passport.agent_id,
                name: passport.name,
                status: passport.status,
                kind: passport.kind,
                owner_id: passport.owner_id,
              });

              // Apply status filter if specified
              console.log(
                `Checking passport ${passport.agent_id}: status=${passport.status}, query.status=${query.status}`
              );
              if (query.status && passport.status !== query.status) {
                console.log(
                  `Filtering out passport ${passport.agent_id} due to status mismatch`
                );
                continue;
              }

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
                  continue; // Skip this passport
                }
              }

              allPassports.push({
                // Core Identity
                agent_id: passport.agent_id,
                slug: passport.slug,
                name: passport.name,
                owner_id: passport.owner_id,
                owner_type: passport.owner_type,
                owner_display: passport.owner_display,
                controller_type: passport.controller_type,
                claimed: passport.claimed,

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
                categories:
                  passport.categories || passport.controlled_categories || [],
                framework:
                  passport.framework || passport.controlled_framework || [],
                logo_url: passport.logo_url,

                // System Metadata
                source: passport.source,
                created_at: passport.created_at,
                updated_at: passport.updated_at,
                version: passport.version,

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
              });
            }
          } catch (error) {
            console.warn(`Failed to fetch passport ${agentId}:`, error);
            // Continue with other passports
          }
        }
      } catch (error) {
        console.warn(`Failed to fetch passports for owner ${ownerId}:`, error);
        // Continue with other owners
      }
    }

    // Sort by updated_at descending
    allPassports.sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

    console.log("Final passport count:", allPassports.length);
    console.log(
      "Final passports:",
      allPassports.map((p) => ({
        agent_id: p.agent_id,
        name: p.name,
        status: p.status,
      }))
    );

    // Apply pagination
    const total = allPassports.length;
    const paginatedPassports = allPassports.slice(
      query.offset || 0,
      (query.offset || 0) + (query.limit || 50)
    );

    // Return success response - match the structure expected by the web app
    const responseData = {
      passports: paginatedPassports,
      total,
      limit: query.limit || 50,
      offset: query.offset || 0,
    };

    console.log("Returning response data:", {
      passportCount: paginatedPassports.length,
      total,
      limit: query.limit || 50,
      offset: query.offset || 0,
      passports: paginatedPassports.map((p) => ({
        agent_id: p.agent_id,
        name: p.name,
        status: p.status,
        kind: p.kind,
      })),
    });

    console.log({ responseLength: responseData.passports.length });

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...cors(request),
      },
    });
  } catch (error) {
    console.log("Passport listing failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      requestId,
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
