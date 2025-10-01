/**
 * @swagger
 * /api/passports/{agent_id}:
 *   put:
 *     summary: Update an existing passport
 *     description: Updates an existing agent passport with comprehensive validation, Verifiable Attestation, and admin support. Supports partial updates and admin overrides.
 *     operationId: updatePassport
 *     tags:
 *       - Passports
 *       - Agent Management
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: agent_id
 *         in: path
 *         required: true
 *         description: The unique identifier of the agent passport to update
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
 *             properties:
 *               name:
 *                 type: string
 *                 description: Updated human-readable name for the agent
 *                 example: "Updated Support Bot"
 *                 minLength: 1
 *                 maxLength: 100
 *               slug:
 *                 type: string
 *                 description: Updated URL-friendly identifier
 *                 example: "updated-support-bot"
 *                 pattern: "^[a-z0-9-]+$"
 *               role:
 *                 type: string
 *                 description: Updated functional role of the agent
 *                 example: "senior_support"
 *                 enum: ["agent", "assistant", "tool", "service"]
 *               description:
 *                 type: string
 *                 description: Updated description of the agent's purpose and capabilities
 *                 example: "Enhanced AI-powered customer support agent with advanced capabilities"
 *                 minLength: 10
 *                 maxLength: 1000
 *               capabilities:
 *                 type: array
 *                 description: Updated list of agent capabilities with optional parameters
 *                 items:
 *                   type: object
 *                   required:
 *                     - id
 *                   properties:
 *                     id:
 *                       type: string
 *                       description: Capability identifier
 *                       example: "payments.refund"
 *                       enum: ["payments.refund", "data.export", "messaging.send", "repo.pr.create", "repo.merge"]
 *                     params:
 *                       type: object
 *                       description: Capability-specific parameters
 *                       additionalProperties: true
 *                       example: {"max_amount": 2000, "currency": "USD"}
 *               limits:
 *                 type: object
 *                 description: Updated operational limits and constraints
 *                 properties:
 *                   refund_amount_max_per_tx:
 *                     type: number
 *                     description: Maximum refund amount per transaction (USD cents)
 *                     example: 10000
 *                     minimum: 0
 *                   refund_amount_daily_cap:
 *                     type: number
 *                     description: Maximum daily refund amount (USD cents)
 *                     example: 100000
 *                     minimum: 0
 *                   max_export_rows:
 *                     type: number
 *                     description: Maximum rows in data exports
 *                     example: 20000
 *                     minimum: 1
 *                   allow_pii:
 *                     type: boolean
 *                     description: Whether PII access is allowed
 *                     example: true
 *                   msgs_per_day:
 *                     type: number
 *                     description: Maximum messages per day
 *                     example: 2000
 *                     minimum: 1
 *                   max_prs_per_day:
 *                     type: number
 *                     description: Maximum pull requests per day
 *                     example: 20
 *                     minimum: 1
 *               regions:
 *                 type: array
 *                 description: Updated geographic regions where the agent can operate
 *                 items:
 *                   type: string
 *                   example: "EU"
 *                   enum: ["US", "EU", "CA", "AP", "global"]
 *                 minItems: 1
 *               contact:
 *                 type: string
 *                 description: Updated contact information for the agent owner
 *                 example: "support@acme.com"
 *                 format: email
 *               links:
 *                 type: object
 *                 description: Updated external links and resources
 *                 properties:
 *                   homepage:
 *                     type: string
 *                     format: uri
 *                     description: Agent homepage URL
 *                     example: "https://acme.com/updated-bot"
 *                   docs:
 *                     type: string
 *                     format: uri
 *                     description: Documentation URL
 *                     example: "https://docs.acme.com/updated-bot"
 *                   repo:
 *                     type: string
 *                     format: uri
 *                     description: Source code repository URL
 *                     example: "https://github.com/acme/updated-support-bot"
 *               category:
 *                 type: string
 *                 description: Updated agent category classification
 *                 example: "senior_support"
 *                 enum: ["customer_support", "sales", "development", "security", "general"]
 *               framework:
 *                 type: string
 *                 description: Updated AI framework used
 *                 example: "anthropic"
 *                 enum: ["openai", "anthropic", "google", "meta", "custom"]
 *               model_info:
 *                 type: object
 *                 description: Updated AI model information and capabilities
 *                 properties:
 *                   model_refs:
 *                     type: array
 *                     description: AI models used by the agent
 *                     items:
 *                       type: object
 *                       properties:
 *                         provider:
 *                           type: string
 *                           example: "Anthropic"
 *                         id:
 *                           type: string
 *                           example: "claude-3.5-sonnet"
 *                         version:
 *                           type: string
 *                           example: "2025-01-01"
 *                         modality:
 *                           type: string
 *                           example: "text"
 *                   tools:
 *                     type: array
 *                     description: External tools integrated
 *                     items:
 *                       type: object
 *                       properties:
 *                         name:
 *                           type: string
 *                           example: "payments"
 *                         provider:
 *                           type: string
 *                           example: "Stripe"
 *               admin_notes:
 *                 type: string
 *                 description: Admin-only notes (requires admin token)
 *                 example: "Updated for enterprise requirements"
 *                 maxLength: 1000
 *               force_update:
 *                 type: boolean
 *                 description: Force update even if validation fails (admin only)
 *                 default: false
 *               skip_validation:
 *                 type: boolean
 *                 description: Skip validation checks (admin only)
 *                 default: false
 *               notify_owner:
 *                 type: boolean
 *                 description: Whether to notify the passport owner of the update
 *                 default: true
 *               webhook_data:
 *                 type: object
 *                 description: Additional data to include in webhook notifications
 *                 additionalProperties: true
 *                 example: {"source": "admin_panel", "admin_user": "admin@company.com"}
 *     responses:
 *       200:
 *         description: Passport updated successfully
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
 *                 audit_id:
 *                   type: string
 *                   description: Audit trail identifier
 *                   example: "audit_123456789"
 *                 changes:
 *                   type: array
 *                   description: List of fields that were changed
 *                   items:
 *                     type: object
 *                     properties:
 *                       field:
 *                         type: string
 *                         example: "name"
 *                       old_value:
 *                         type: string
 *                         example: "Old Support Bot"
 *                       new_value:
 *                         type: string
 *                         example: "Updated Support Bot"
 *       400:
 *         description: Bad request - validation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "validation_failed"
 *               message: "Name is required and must be between 1-100 characters"
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
 *               message: "Only passport owner or admin can update passport"
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
 *         description: Conflict - update conflicts with existing data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "conflict"
 *               message: "Passport with this name already exists"
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
import { PassportRow } from "../../../adapters/ports";
import { UpdatePassportRequest, Capability } from "../../../../types/passport";
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
import { createTieredPassportCache } from "../../../utils/tiered-cache";
import { cors } from "../../../utils/cors";
import { createLogger } from "../../../utils/logger";
import { createCache } from "../../../utils/cache";
import { createVerifyRateLimiter } from "../../../utils/rate-limit";
import {
  preSerializePassport,
  buildPassportObject,
} from "../../../utils/serialization";
import {
  createAuditAction,
  completeAuditAction,
  storeAuditAction,
  getLastActionHash,
  computePassportDiffs,
} from "../../../utils/audit-trail";
import {
  validateAndResolveOwner,
  updateOwnerAgentsIndex,
  updateOrgAgentsIndex,
} from "../../../utils/owner-utils";
import {
  sendWebhook,
  createPassportUpdatedPayload,
  WebhookConfig,
} from "../../../utils/webhook";
import { validateMCPConfig } from "../../../utils/mcp-validation";
import { updateIndexes } from "../../../utils/passport-common";
import {
  updateAgentRouting,
  readAgentRouting,
} from "../../../utils/agent-routing";
import { resolveTenantBindings } from "../../../runtime/region";

// ============================================================================
// Request/Response Types
// ============================================================================

interface EnhancedUpdatePassportRequest extends UpdatePassportRequest {
  // Admin-specific fields
  admin_notes?: string;
  force_update?: boolean;

  // Validation options
  skip_validation?: boolean;

  // Admin-only fields
  assurance_level?: "L0" | "L1" | "L2" | "L3" | "L4KYC" | "L4FIN";
  assurance_method?: string;
  assurance_verified_at?: string;
  verification_status?: "unverified" | "email_verified" | "github_verified";
  verification_method?: string;
  verification_evidence?: {
    github_user?: string;
    org_id?: string;
    repo_ids?: string[];
    email?: string;
    verified_at: string;
  };
  source?: "admin" | "form" | "crawler";
  creator_id?: string;
  creator_type?: "org" | "user";
}

interface UpdatePassportResponse {
  success: boolean;
  data?: PassportRow;
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
  const requestId = `update_${Date.now()}_${Math.random()
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
    const body: EnhancedUpdatePassportRequest = await request.json();

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
      requiredApiKeyScopes: ["update"],
    });

    if (!authResult.success) {
      console.log("Authentication failed", {
        error: authResult.error,
        requestId,
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
    const existingPassport = await getCurrentPassport(env, agent_id);
    if (!existingPassport) {
      return createAuthErrorResponse("Passport not found", 404, requestId);
    }

    // Comprehensive validation with admin status and current passport
    const validation = await validateUpdateRequest(
      body,
      agent_id,
      isAdmin,
      existingPassport
    );
    if (!validation.valid) {
      console.log("Validation failed", { error: validation.error, requestId });
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
      console.log("Resource access denied", {
        error: resourceCheck.error,
        ownerId,
        requestId,
      });
      return createAuthErrorResponse(
        resourceCheck.error!,
        resourceCheck.statusCode || 403,
        requestId
      );
    }

    // Resolve tenant information first
    const tenant = await resolveTenantFromOrgId(env, ownerId);
    const bindings = resolveTenantBindings(env, tenant);

    // Debug: Log what KV we're using
    console.log("Update endpoint KV resolution:", {
      tenant: tenant,
      bindings: bindings,
      kvBinding: bindings.kv ? "tenant-specific" : "default",
      kvInstance: bindings.kv || env.ai_passport_registry,
    });

    // Get tenant-specific KV (fallback to default for admin operations)
    // For now, always use default KV to ensure consistency with other endpoints
    const kv = bindings.kv || env.ai_passport_registry;

    const ownerType = ownerId.startsWith("ap_org_") ? "org" : "user";
    // Validate and resolve owner
    const ownerValidation = await validateAndResolveOwner(
      kv,
      ownerId,
      ownerType
    );
    if (!ownerValidation.valid) {
      return createAuthErrorResponse(ownerValidation.error!, 400, requestId);
    }
    console.log("Owner validation", ownerValidation);

    // Create TenantDO client
    const tenantDO = createTenantDOClientFromEnv(env, ownerId, {
      timeout: 10000,
      maxRetries: 3,
    });

    // Initialize tenant with region-specific bindings
    await tenantDO.initializeTenant(tenant);

    // Get current passport for Verifiable Attestation
    const currentPassport = await getCurrentPassport(env, agent_id);
    console.log("Current passport", currentPassport);
    if (!currentPassport) {
      return createAuthErrorResponse("Passport not found", 404, requestId);
    }

    // Validate MCP config if provided
    if ((body as any).mcp) {
      const mcpValidation = validateMCPConfig((body as any).mcp);
      if (!mcpValidation.valid) {
        return createAuthErrorResponse(
          `MCP config validation failed: ${mcpValidation.errors?.join(", ")}`,
          400,
          requestId
        );
      }
    }

    // Build updated passport row
    const updatedPassport: PassportRow = {
      ...currentPassport,
      ...body,
      agent_id, // Ensure agent_id is preserved
      updated_at: new Date().toISOString(),
    };

    // Create audit action
    const changes = computePassportDiffs(currentPassport, updatedPassport);
    const auditAction = await createAuditAction(
      "update",
      agent_id,
      authResult.user!.user.user_id,
      changes,
      body.admin_notes || "Passport updated"
    );

    // Get previous hash for audit chain
    const prevHash = await getLastActionHash(kv, agent_id);

    // Update passport through TenantDO
    const result = await tenantDO.updatePassport(
      updatedPassport,
      (body as any).expected_version || 1
    );

    // Check if owner or region changed and update agent routing if needed
    const currentAgentInfo = await readAgentRouting(kv, agent_id);
    if (currentAgentInfo) {
      const newRegion = tenant.region || "US";
      const ownerChanged = currentAgentInfo.owner_id !== ownerId;
      const regionChanged = currentAgentInfo.region !== newRegion;

      if (ownerChanged || regionChanged) {
        await updateAgentRouting(
          kv,
          agent_id,
          ownerId,
          newRegion,
          currentAgentInfo.version
        );
      }
    }

    // Complete audit action
    const completedAuditAction = await completeAuditAction(
      auditAction,
      prevHash,
      env.REGISTRY_PRIVATE_KEY || ""
    );

    // Store audit action
    await storeAuditAction(kv, completedAuditAction);

    // Update indexes
    await updateIndexes(
      kv,
      agent_id,
      updatedPassport.slug,
      updatedPassport.name
    );

    // Invalidate tenant-specific tiered cache immediately
    const tieredCache = createTieredPassportCache(kv);
    await tieredCache.invalidatePassport(agent_id);

    // Schedule KV refresh and R2 backup asynchronously
    scheduleKVRefresh({
      agentId: agent_id,
      passportData: result,
      env,
      ctx,
      kv,
    });

    scheduleR2Backup(agent_id, result, env, ctx, bindings.region, bindings.r2);

    // Send webhook notification
    if (env.WEBHOOK_URL && env.WEBHOOK_SECRET) {
      const webhookConfig: WebhookConfig = {
        url: env.WEBHOOK_URL,
        secret: env.WEBHOOK_SECRET,
      };

      const webhookPayload = createPassportUpdatedPayload(
        requestId,
        updatedPassport.owner_type,
        ownerId,
        agent_id,
        changes
      );

      // Send webhook asynchronously
      sendWebhook(webhookConfig, webhookPayload).catch((error) => {
        console.log("Webhook failed", { error: error.message, requestId });
      });
    }

    // Return success response
    return response.success(
      {
        ...result,
        audit_id: completedAuditAction.id,
      },
      200,
      "Passport updated successfully"
    );
  } catch (error) {
    console.log("Passport update failed", {
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

async function validateUpdateRequest(
  body: EnhancedUpdatePassportRequest,
  agent_id: string,
  isAdmin: boolean = false,
  currentPassport?: any
): Promise<{ valid: boolean; error?: string }> {
  // agent_id is now provided in URL path, not required in body

  if (!body.owner_id) {
    return { valid: false, error: "Missing required field: owner_id" };
  }

  // Validate owner_id format using ValidationUtils
  if (body.owner_id && !ValidationUtils.validateOwnerId(body.owner_id)) {
    return { valid: false, error: ERROR_MESSAGES.INVALID_OWNER_ID };
  }

  // Validate agent_id matches parameter
  if (body.agent_id !== agent_id) {
    return { valid: false, error: "agent_id mismatch between URL and body" };
  }

  // Validate status if provided using ValidationUtils
  if (body.status && !ValidationUtils.validateStatus(body.status)) {
    return { valid: false, error: ERROR_MESSAGES.INVALID_STATUS };
  }

  // Validate email format if provided
  if (body.contact && !ValidationUtils.validateEmail(body.contact)) {
    return { valid: false, error: ERROR_MESSAGES.INVALID_EMAIL };
  }

  // Validate regions if provided
  if (body.regions && !Array.isArray(body.regions)) {
    return { valid: false, error: "regions must be an array" };
  }

  // Validate capabilities according to Capability interface
  if (body.capabilities) {
    const capabilityValidation = ValidationUtils.validateCapabilityObjects(
      body.capabilities
    );
    if (!capabilityValidation.valid) {
      return { valid: false, error: capabilityValidation.error };
    }
  }

  // Validate admin-only fields
  const adminValidation = ValidationUtils.validateAdminFields(body, isAdmin);
  if (!adminValidation.valid) {
    return { valid: false, error: adminValidation.error };
  }

  // Validate assurance level changes (admin-only for high levels)
  if (body.assurance_level && currentPassport) {
    const assuranceValidation = ValidationUtils.validateAssuranceLevelChange(
      currentPassport.assurance_level || "L0",
      body.assurance_level,
      isAdmin
    );
    if (!assuranceValidation.valid) {
      return { valid: false, error: assuranceValidation.error };
    }
  }

  // Validate verification status changes (admin-only)
  if (body.verification_status && currentPassport) {
    const verificationValidation =
      ValidationUtils.validateVerificationStatusChange(
        currentPassport.verification_status || "unverified",
        body.verification_status,
        isAdmin
      );
    if (!verificationValidation.valid) {
      return { valid: false, error: verificationValidation.error };
    }
  }

  // Validate source field changes (admin-only for "admin" source)
  if (body.source && currentPassport) {
    const sourceValidation = ValidationUtils.validateSourceChange(
      currentPassport.source || "form",
      body.source,
      isAdmin
    );
    if (!sourceValidation.valid) {
      return { valid: false, error: sourceValidation.error };
    }
  }

  return { valid: true };
}

async function getCurrentPassport(env: any, agent_id: string): Promise<any> {
  try {
    const key = `passport:${agent_id}`;
    const passportData = await env.ai_passport_registry.get(key, "json");
    return passportData;
  } catch (error) {
    console.log("Failed to get current passport", { error, agent_id });
    return null;
  }
}
