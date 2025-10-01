/**
 * @swagger
 * /api/passports/{agent_id}/status:
 *   put:
 *     summary: Update passport status
 *     description: Changes the status of an existing passport (suspend, activate, revoke) with comprehensive validation, Verifiable Attestation, and admin support. Triggers webhooks and cache invalidation.
 *     operationId: updatePassportStatus
 *     tags:
 *       - Passports
 *       - Status Management
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: agent_id
 *         in: path
 *         required: true
 *         description: The unique identifier of the agent passport
 *         schema:
 *           type: string
 *           pattern: "^ap_[a-zA-Z0-9]+$"
 *           example: "aeebc92d-13fb-4e23-8c3c-1aa82b167da6"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - agent_id
 *               - owner_id
 *               - status
 *             properties:
 *               agent_id:
 *                 type: string
 *                 description: The agent passport ID (must match path parameter)
 *                 pattern: "^ap_[a-zA-Z0-9]+$"
 *                 example: "aeebc92d-13fb-4e23-8c3c-1aa82b167da6"
 *               owner_id:
 *                 type: string
 *                 description: The owner ID of the passport
 *                 pattern: "^(ap_org_|ap_user_)[a-zA-Z0-9]+$"
 *                 example: "ap_org_456"
 *               status:
 *                 type: string
 *                 description: New status for the passport
 *                 enum: ["draft", "active", "suspended", "revoked"]
 *                 example: "suspended"
 *               reason:
 *                 type: string
 *                 description: Reason for the status change
 *                 example: "Policy violation detected"
 *                 maxLength: 500
 *               admin_notes:
 *                 type: string
 *                 description: Admin-only notes (requires admin token)
 *                 example: "Suspended due to suspicious activity"
 *                 maxLength: 1000
 *               force_change:
 *                 type: boolean
 *                 description: Force status change even if validation fails (admin only)
 *                 default: false
 *               notify_owner:
 *                 type: boolean
 *                 description: Whether to notify the passport owner of the status change
 *                 default: true
 *               webhook_data:
 *                 type: object
 *                 description: Additional data to include in webhook notifications
 *                 additionalProperties: true
 *                 example: {"source": "admin_panel", "admin_user": "admin@company.com"}
 *     responses:
 *       200:
 *         description: Status updated successfully
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
 *                     - success
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     previous_status:
 *                       type: string
 *                       description: Previous status of the passport
 *                       example: "active"
 *                     new_status:
 *                       type: string
 *                       description: New status of the passport
 *                       example: "suspended"
 *                     changed_at:
 *                       type: string
 *                       format: date-time
 *                       description: Timestamp when status was changed
 *                       example: "2025-01-16T10:30:00Z"
 *                 requestId:
 *                   type: string
 *                   description: Unique request identifier
 *                   example: "req_123456789"
 *                 audit_id:
 *                   type: string
 *                   description: Audit trail identifier
 *                   example: "audit_123456789"
 *       400:
 *         description: Bad request - validation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "validation_failed"
 *               message: "Invalid status transition from active to draft"
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
 *               message: "Only passport owner or admin can change status"
 *       404:
 *         description: Passport not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "not_found"
 *               message: "Passport with ID aeebc92d-13fb-4e23-8c3c-1aa82b167da6 not found"
 *       409:
 *         description: Conflict - invalid status transition
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "conflict"
 *               message: "Cannot change status from revoked to active"
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

import { createTenantDOClientFromEnv } from "../../../runtime/TenantDOClient";
import { resolveTenantFromOrgId } from "../../../runtime/region";
import { createKVResolver, getKVForOwner } from "../../../utils/kv-resolver";
import {
  canAccessResource,
  extractOwnerId,
  createAuthErrorResponse,
  createSuccessResponse,
} from "../../../utils/general-auth";
import { authMiddleware, AuthResult } from "../../../utils/auth-middleware";
import {
  ValidationUtils,
  ERROR_MESSAGES,
  ApiResponse,
  HTTP_STATUS,
} from "../../../utils/api-response";
import {
  scheduleKVRefresh,
  scheduleR2Backup,
} from "../../../utils/passport-kv-refresh";
import { cors } from "../../../utils/cors";
import { createLogger } from "../../../utils/logger";
import { createCache } from "../../../utils/cache";
import { createVerifyRateLimiter } from "../../../utils/rate-limit";
import {
  createAuditAction,
  completeAuditAction,
  storeAuditAction,
  getLastActionHash,
  computePassportDiffs,
} from "../../../utils/audit-trail";
import {
  sendWebhook,
  createStatusChangedPayload,
  WebhookConfig,
} from "../../../utils/webhook";
import { purgeVerifyCache } from "../../../utils/cache-purge";
import { createTieredPassportCache } from "../../../utils/tiered-cache";
import { resolveTenantBindings } from "../../../runtime/region";

// ============================================================================
// Request/Response Types
// ============================================================================

interface StatusChangeRequest {
  agent_id: string;
  owner_id: string;
  status: "draft" | "active" | "suspended" | "revoked";
  reason?: string;

  // Admin-specific fields
  admin_notes?: string;
  force_status_change?: boolean;

  // Validation options
  skip_validation?: boolean;
}

interface StatusChangeResponse {
  success: boolean;
  data?: { success: boolean };
  error?: string;
  requestId: string;
  audit_id?: string;
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

export const onRequestPut = async ({
  request,
  env,
  ctx,
  params,
}: {
  request: Request;
  env: any;
  ctx: any;
  params: any;
}) => {
  const startTime = Date.now();
  const requestId = `status_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 8)}`;
  const agent_id = params?.agent_id as string;

  // CORS headers
  const corsHeaders = cors(request);

  try {
    // Initialize logger and cache
    const logger = createLogger(env.ai_passport_registry);
    const cache = createCache(env);
    const rateLimiter = createVerifyRateLimiter(env);

    // Initialize KV resolver for multi-region/multi-tenant support
    const kvResolver = createKVResolver(env);

    // Initialize response handler
    const response = new ApiResponse(cors(request), env.ai_passport_registry);

    // Rate limiting
    const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
    const rateLimitResult = await rateLimiter.checkLimit(clientIP);
    if (!rateLimitResult.allowed) {
      return response.error(
        {
          error: "rate_limit_exceeded",
          message: "Rate limit exceeded",
          details: { requestId },
        },
        429
      );
    }

    // Validate agent_id parameter
    if (!agent_id) {
      return response.badRequest("Missing agent_id parameter", ["agent_id"], {
        requestId,
      });
    }

    // Parse request body
    const body: StatusChangeRequest = await request.json();

    // Add agent_id from URL to body for validation
    body.agent_id = agent_id;

    // Extract owner ID with admin support
    const ownerId = extractOwnerId(body);
    if (!ownerId) {
      return createAuthErrorResponse(
        "Missing required field: owner_id",
        400,
        requestId
      );
    }

    // Authenticate request (supports cookies, JWT, API keys, and admin tokens)
    const authResult: AuthResult = await authMiddleware(request, env as any, {
      requireAuth: true,
      allowApiKey: true,
      requiredApiKeyScopes: ["status"],
    });

    if (!authResult.success) {
      logger.logError(request, new Error(authResult.error!), {
        clientIP,
        agentId: agent_id,
      });
      return createAuthErrorResponse(
        authResult.error!,
        authResult.statusCode || 401,
        requestId
      );
    }

    // Check if user is admin
    const isAdmin =
      authResult.user?.platform_roles?.includes("registry_admin") || false;

    // Get current passport for validation
    const existingPassport = await getCurrentPassport(
      env.ai_passport_registry,
      agent_id
    );
    if (!existingPassport) {
      return createAuthErrorResponse("Passport not found", 404, requestId);
    }

    // Comprehensive validation with admin status and current passport
    const validation = await validateStatusChangeRequest(
      body,
      agent_id,
      isAdmin,
      existingPassport
    );
    if (!validation.valid) {
      logger.logError(request, new Error(validation.error!), {
        clientIP,
        agentId: agent_id,
      });
      return response.badRequest(validation.error!, undefined, { requestId });
    }

    // Check resource access
    const resourceCheck = canAccessResource(authResult.user!, {
      resourceOwnerId: ownerId,
      operation: "update",
      allowSelfAccess: true,
      allowOrgAccess: true,
      allowAdminAccess: true,
    });

    if (!resourceCheck.allowed) {
      logger.logError(request, new Error(resourceCheck.error!), {
        clientIP,
        agentId: agent_id,
      });
      return createAuthErrorResponse(
        resourceCheck.error!,
        resourceCheck.statusCode || 403,
        requestId
      );
    }

    // Resolve tenant information
    const tenant = await resolveTenantFromOrgId(env, ownerId);
    const bindings = resolveTenantBindings(env, tenant);

    // Get tenant-specific KV (fallback to default for admin operations)
    // For now, always use default KV to ensure consistency with other endpoints
    const kv = env.ai_passport_registry;

    // Create TenantDO client
    const tenantDO = createTenantDOClientFromEnv(env, ownerId, {
      timeout: 10000,
      maxRetries: 3,
    });

    // Initialize tenant with region-specific bindings
    await tenantDO.initializeTenant(tenant);

    // Get current passport for Verifiable Attestation
    const currentPassport = await getCurrentPassport(kv, agent_id);
    if (!currentPassport) {
      return createAuthErrorResponse("Passport not found", 404, requestId);
    }

    // Validate status transition
    const statusValidation = validateStatusTransition(
      currentPassport.status,
      body.status
    );
    if (!statusValidation.valid) {
      return createAuthErrorResponse(statusValidation.error!, 400, requestId);
    }

    // Create audit action
    const changes = computePassportDiffs(currentPassport, {
      ...currentPassport,
      status: body.status,
    });
    const auditAction = await createAuditAction(
      "status_change",
      agent_id,
      authResult.user!.user.user_id,
      changes,
      body.reason ||
        `Status changed from ${currentPassport.status} to ${body.status}`
    );

    // Get region-specific KV for owner
    // const kv = await getKVForOwner(env, ownerId);

    // Get previous hash for audit chain
    const prevHash = await getLastActionHash(kv, agent_id);

    // Change status through TenantDO
    const result = await tenantDO.changeStatus(
      agent_id,
      body.status,
      body.reason
    );

    // Complete audit action
    const completedAuditAction = await completeAuditAction(
      auditAction,
      prevHash,
      env.REGISTRY_PRIVATE_KEY || ""
    );

    // Store audit action
    await storeAuditAction(kv, completedAuditAction);

    // Immediate cache invalidation for status changes - tenant/region aware
    await purgeVerifyCache(
      agent_id,
      env.APP_BASE_URL,
      env.CLOUDFLARE_API_TOKEN,
      env.CLOUDFLARE_ZONE_ID
    );

    // Invalidate tenant-specific tiered cache
    const tieredCache = createTieredPassportCache(kv);
    await tieredCache.invalidatePassport(agent_id);

    // Schedule KV refresh and R2 backup asynchronously
    scheduleKVRefresh({
      agentId: agent_id,
      passportData: { ...currentPassport, status: body.status },
      env,
      ctx,
      kv,
    });

    scheduleR2Backup(
      agent_id,
      { ...currentPassport, status: body.status },
      env,
      ctx,
      bindings.region,
      bindings.r2
    );

    // Send webhook notification
    if (env.WEBHOOK_URL && env.WEBHOOK_SECRET) {
      const webhookConfig: WebhookConfig = {
        url: env.WEBHOOK_URL,
        secret: env.WEBHOOK_SECRET,
      };

      const webhookPayload = createStatusChangedPayload(
        requestId,
        currentPassport.owner_type,
        ownerId,
        agent_id,
        body.status,
        currentPassport.status
      );

      // Send webhook asynchronously
      sendWebhook(webhookConfig, webhookPayload).catch((error) => {
        logger.logError(request, new Error(error.message), {
          clientIP,
          agentId: agent_id,
        });
      });
    }

    // Return success response
    return response.success(
      {
        success: true,
        audit_id: completedAuditAction.id,
      },
      200,
      "Status updated successfully"
    );
  } catch (error) {
    console.log("Status change failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      requestId,
    });

    const errorResponse = new ApiResponse(
      cors(request),
      env.ai_passport_registry
    );
    return errorResponse.error(
      {
        error: "internal_server_error",
        message: "Internal server error",
        details: { requestId },
      },
      500
    );
  }
};

// ============================================================================
// Helper Functions
// ============================================================================

async function validateStatusChangeRequest(
  body: StatusChangeRequest,
  agent_id: string,
  isAdmin: boolean = false,
  currentPassport?: any
): Promise<{ valid: boolean; error?: string }> {
  // agent_id is now provided in URL path, not required in body

  if (!body.owner_id) {
    return { valid: false, error: "Missing required field: owner_id" };
  }

  if (!body.status) {
    return { valid: false, error: "Missing required field: status" };
  }

  // Validate owner_id format using ValidationUtils
  if (body.owner_id && !ValidationUtils.validateOwnerId(body.owner_id)) {
    return { valid: false, error: ERROR_MESSAGES.INVALID_OWNER_ID };
  }

  // Validate agent_id matches parameter
  if (body.agent_id !== agent_id) {
    return { valid: false, error: "agent_id mismatch between URL and body" };
  }

  // Validate status value using ValidationUtils
  if (!ValidationUtils.validateStatus(body.status)) {
    return { valid: false, error: ERROR_MESSAGES.INVALID_STATUS };
  }

  // Validate status transitions (admin-only for certain transitions)
  if (currentPassport) {
    const statusTransition = validateStatusTransition(
      currentPassport.status,
      body.status
    );
    if (!statusTransition.valid) {
      return { valid: false, error: statusTransition.error };
    }

    // Only admins can transition to/from certain statuses
    const restrictedTransitions = [
      { from: "revoked", to: "active" },
      { from: "revoked", to: "suspended" },
      { from: "revoked", to: "draft" },
    ];

    const isRestrictedTransition = restrictedTransitions.some(
      (transition) =>
        currentPassport.status === transition.from &&
        body.status === transition.to
    );

    if (isRestrictedTransition && !isAdmin) {
      return {
        valid: false,
        error: "Admin privileges required for this status transition",
      };
    }
  }

  return { valid: true };
}

async function getCurrentPassport(
  kv: KVNamespace,
  agent_id: string
): Promise<any> {
  try {
    const key = `passport:${agent_id}`;
    const passportData = await kv.get(key, "json");
    return passportData;
  } catch (error) {
    console.log("Failed to get current passport", { error, agent_id });
    return null;
  }
}

function validateStatusTransition(
  currentStatus: string,
  newStatus: string
): { valid: boolean; error?: string } {
  const validTransitions: Record<string, string[]> = {
    draft: ["active", "suspended", "revoked"],
    active: ["suspended", "revoked"],
    suspended: ["active", "revoked"],
    revoked: [], // No transitions from revoked
  };

  const allowedTransitions = validTransitions[currentStatus] || [];
  if (!allowedTransitions.includes(newStatus)) {
    return {
      valid: false,
      error: `Invalid status transition from ${currentStatus} to ${newStatus}`,
    };
  }

  return { valid: true };
}
