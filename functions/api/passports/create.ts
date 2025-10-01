/**
 * @swagger
 * /api/passports:
 *   post:
 *     summary: Create a new agent passport
 *     description: Creates a new agent passport (template or instance) with comprehensive validation, Verifiable Attestation, and admin support. Supports both regular user creation and admin-created passports.
 *     operationId: createPassport
 *     tags:
 *       - Passports
 *       - Agent Management
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - role
 *               - description
 *               - capabilities
 *               - limits
 *               - regions
 *               - contact
 *             properties:
 *               name:
 *                 type: string
 *                 description: Human-readable name for the agent
 *                 example: "Acme Support Bot"
 *                 minLength: 1
 *                 maxLength: 100
 *               slug:
 *                 type: string
 *                 description: URL-friendly identifier (auto-generated if not provided)
 *                 example: "acme-support-bot"
 *                 pattern: "^[a-z0-9-]+$"
 *               role:
 *                 type: string
 *                 description: Functional role of the agent
 *                 example: "customer_support"
 *                 enum: ["agent", "assistant", "tool", "service"]
 *               description:
 *                 type: string
 *                 description: Detailed description of the agent's purpose and capabilities
 *                 example: "AI-powered customer support agent for handling common inquiries"
 *                 minLength: 10
 *                 maxLength: 1000
 *               capabilities:
 *                 type: array
 *                 description: List of agent capabilities with optional parameters
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
 *                       example: {"max_amount": 1000, "currency": "USD"}
 *               limits:
 *                 type: object
 *                 description: Operational limits and constraints
 *                 properties:
 *                   refund_amount_max_per_tx:
 *                     type: number
 *                     description: Maximum refund amount per transaction (USD cents)
 *                     example: 5000
 *                     minimum: 0
 *                   refund_amount_daily_cap:
 *                     type: number
 *                     description: Maximum daily refund amount (USD cents)
 *                     example: 50000
 *                     minimum: 0
 *                   max_export_rows:
 *                     type: number
 *                     description: Maximum rows in data exports
 *                     example: 10000
 *                     minimum: 1
 *                   allow_pii:
 *                     type: boolean
 *                     description: Whether PII access is allowed
 *                     example: false
 *                   msgs_per_day:
 *                     type: number
 *                     description: Maximum messages per day
 *                     example: 1000
 *                     minimum: 1
 *                   max_prs_per_day:
 *                     type: number
 *                     description: Maximum pull requests per day
 *                     example: 10
 *                     minimum: 1
 *               regions:
 *                 type: array
 *                 description: Geographic regions where the agent can operate
 *                 items:
 *                   type: string
 *                   example: "US"
 *                   enum: ["US", "EU", "CA", "AP", "global"]
 *                 minItems: 1
 *               contact:
 *                 type: string
 *                 description: Contact information for the agent owner
 *                 example: "admin@acme.com"
 *                 format: email
 *               links:
 *                 type: object
 *                 description: External links and resources
 *                 properties:
 *                   homepage:
 *                     type: string
 *                     format: uri
 *                     description: Agent homepage URL
 *                     example: "https://acme.com/bot"
 *                   docs:
 *                     type: string
 *                     format: uri
 *                     description: Documentation URL
 *                     example: "https://docs.acme.com/bot"
 *                   repo:
 *                     type: string
 *                     format: uri
 *                     description: Source code repository URL
 *                     example: "https://github.com/acme/support-bot"
 *               category:
 *                 type: string
 *                 description: Agent category classification
 *                 example: "customer_support"
 *                 enum: ["customer_support", "sales", "development", "security", "general"]
 *               framework:
 *                 type: string
 *                 description: AI framework used
 *                 example: "openai"
 *                 enum: ["openai", "anthropic", "google", "meta", "custom"]
 *               model_info:
 *                 type: object
 *                 description: AI model information and capabilities
 *                 properties:
 *                   model_refs:
 *                     type: array
 *                     description: AI models used by the agent
 *                     items:
 *                       type: object
 *                       properties:
 *                         provider:
 *                           type: string
 *                           example: "OpenAI"
 *                         id:
 *                           type: string
 *                           example: "gpt-4o-mini"
 *                         version:
 *                           type: string
 *                           example: "2025-08-01"
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
 *                 example: "Created for enterprise client"
 *               force_create:
 *                 type: boolean
 *                 description: Force creation even if validation fails (admin only)
 *                 default: false
 *               template_id:
 *                 type: string
 *                 description: Template ID for instance creation
 *                 example: "ap_template_123"
 *               instance_overrides:
 *                 type: object
 *                 description: Instance-specific overrides for template-based creation
 *                 additionalProperties: true
 *               skip_validation:
 *                 type: boolean
 *                 description: Skip validation checks (admin only)
 *                 default: false
 *     responses:
 *       201:
 *         description: Passport created successfully
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
 *               message: "Admin privileges required for this operation"
 *       409:
 *         description: Conflict - passport already exists
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
import { createAdminRateLimiter, RateLimiter } from "../../utils/rate-limit";
import { createTenantDOClientFromEnv } from "../../runtime/TenantDOClient";
import {
  resolveTenantFromOrgId,
  resolveTenantBindings,
} from "../../runtime/region";
import { createKVResolver, getKVForOwner } from "../../utils/kv-resolver";
import { PassportRow } from "../../adapters/ports";
import { CreatePassportRequest, Capability } from "../../../types/passport";
import {
  canAccessResource,
  extractOwnerId,
  createAuthErrorResponse,
  createSuccessResponse,
} from "../../utils/general-auth";
import { authMiddleware, AuthResult } from "../../utils/auth-middleware";
import {
  ValidationUtils,
  ERROR_MESSAGES,
  ApiResponse,
  HTTP_STATUS,
} from "../../utils/api-response";
import {
  scheduleKVRefresh,
  scheduleR2Backup,
} from "../../utils/passport-kv-refresh";
import { cors } from "../../utils/cors";
import { createLogger } from "../../utils/logger";
import { createCache } from "../../utils/cache";
import { createVerifyRateLimiter } from "../../utils/rate-limit";
import {
  preSerializePassport,
  buildPassportObject,
} from "../../utils/serialization";
import {
  createAuditAction,
  completeAuditAction,
  storeAuditAction,
  getLastActionHash,
  computePassportDiffs,
} from "../../utils/audit-trail";
import {
  validateAndResolveOwner,
  updateOwnerAgentsIndex,
  updateOrgAgentsIndex,
} from "../../utils/owner-utils";
import {
  generateSlug,
  normalizeName,
  findUniqueSlug,
  isNameUnique,
  updateIndexes,
} from "../../utils/passport-common";
import { generateAgentId, writeAgentRouting } from "../../utils/agent-routing";
import {
  generateTemplateId,
  generateInstanceId,
} from "../../utils/template-instance";
import { validateMCPConfig } from "../../utils/mcp-validation";
import { computePassportEvaluation } from "../../utils/policy-evaluation";
import { PassportCategory, PassportFramework } from "../../utils/taxonomy";
import { AssuranceLevel, AssuranceMethod } from "../../../types/auth";

// ============================================================================
// Request/Response Types
// ============================================================================

interface CreatePassportResponse {
  success: boolean;
  data?: PassportRow;
  error?: string;
  requestId: string;
  audit_id?: string;
}

interface FinalCreatePassportRequest extends CreatePassportRequest {
  // Admin-specific fields
  admin_notes?: string;
  force_create?: boolean;

  // Template/Instance fields
  template_id?: string;
  instance_overrides?: Record<string, any>;

  // Validation options
  skip_validation?: boolean;
  skip_audit?: boolean;
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

export const onRequestPost = async ({
  request,
  env,
  ctx,
}: {
  request: Request;
  env: any;
  ctx: any;
}) => {
  const requestId = `req_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;

  // Initialize logger and cache
  const logger = createLogger(env.ai_passport_registry);
  const cache = createCache(env);
  const rateLimiter = createVerifyRateLimiter(env.ai_passport_registry);

  // Initialize KV resolver for multi-region/multi-tenant support
  const kvResolver = createKVResolver(env);

  // Initialize response handler
  const response = new ApiResponse(cors(request), env.ai_passport_registry);

  try {
    // Handle CORS
    if (request.method === "OPTIONS") {
      return cors(request);
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

    // Parse request body
    const body: FinalCreatePassportRequest = await request.json();

    // Extract owner ID with admin support
    const ownerId = extractOwnerId(body);
    if (!ownerId) {
      return response.badRequest(
        "Missing required field: owner_id",
        ["owner_id"],
        { requestId }
      );
    }

    // Authenticate request (supports cookies, JWT, API keys, and admin tokens)
    const authResult: AuthResult = await authMiddleware(request, env as any, {
      requireAuth: true,
      allowApiKey: true,
      requiredApiKeyScopes: ["issue"],
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
    console.log("isAdmin", isAdmin);
    console.log("authResult", authResult);

    // Comprehensive validation with admin status
    const validation = await validateCreatePassportRequest(body, env, isAdmin);
    console.log("validation", validation);
    console.log("body", body);
    if (!validation.valid) {
      return response.badRequest(validation.error!, undefined, { requestId });
    }

    // Check resource access
    const resourceCheck = canAccessResource(authResult.user!, {
      resourceOwnerId: ownerId,
      operation: "create",
      allowSelfAccess: true,
      allowOrgAccess: true,
      allowAdminAccess: true,
    });

    if (!resourceCheck.allowed) {
      return response.error(
        {
          error: "forbidden",
          message: resourceCheck.error!,
          details: { requestId },
        },
        resourceCheck.statusCode || 403
      );
    }

    // Resolve tenant information first
    const tenant = await resolveTenantFromOrgId(env, ownerId);
    const bindings = resolveTenantBindings(env, tenant);

    // Use resolved KV for operations

    // Get tenant-specific KV (fallback to default for admin operations)
    // For now, always use default KV to ensure consistency with other endpoints
    const kv = env.ai_passport_registry;

    // Determine owner type from owner ID
    const ownerType = ownerId.startsWith("ap_org_") ? "org" : "user";

    // Validate and resolve owner
    const ownerValidation = await validateAndResolveOwner(
      kv,
      ownerId,
      ownerType
    );
    if (!ownerValidation.valid) {
      return response.badRequest(ownerValidation.error!, undefined, {
        requestId,
      });
    }

    // Create TenantDO client
    const tenantDO = createTenantDOClientFromEnv(env, ownerId, {
      timeout: 10000,
      maxRetries: 3,
    });

    // Initialize tenant with region-specific bindings
    await tenantDO.initializeTenant(tenant);

    // Generate unique identifiers (always auto-generate, never accept from user)
    const agentId = generateAgentId();
    const slug = generateSlug(body.name);

    // Check for uniqueness
    const isUnique = await isNameUnique(slug, kv, ownerId);
    if (!isUnique) {
      const uniqueSlug = await findUniqueSlug(slug, kv, ownerId);
      if (!uniqueSlug) {
        return response.badRequest(
          "Unable to generate unique slug",
          undefined,
          { requestId }
        );
      }
    }

    // Build passport row with comprehensive data
    const passport: PassportRow = {
      // Core Identity
      agent_id: agentId,
      slug: isUnique ? slug : await findUniqueSlug(slug, kv, ownerId),
      name: normalizeName(body.name),
      owner_id: ownerId,
      owner_type: ownerType,
      owner_display: ownerValidation.ownerInfo?.owner_display || ownerId,
      controller_type: ownerType === "org" ? "org" : "user",
      claimed: false,
      spec_version: env.SPEC_VERSION,

      // Passport Details
      role: body.role,
      description: body.description,
      contact: body.contact,
      status: body.status || "draft",
      assurance_level: body.assurance_level || "L1",
      source: (body.source as "admin" | "form" | "crawler") || "form",

      // Required fields with defaults
      capabilities: body.capabilities || [],
      limits: body.limits || {
        max_actions_per_min: 100,
        max_export_rows: 1000,
      },
      regions: body.regions || ["US"],
      verification_status: "unverified",
      assurance_method: "self_attested",
      links: body.links || {},
      categories: body.categories || [],
      framework: body.framework || [],

      // Template/Instance
      kind: body.kind || "template",
      template_id: body.template_id,

      // Metadata
      version: body.version || "1.0.0",
      version_number: 1,

      // Timestamps
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Create audit action
    const changes = computePassportDiffs(null, passport);
    const auditAction = await createAuditAction(
      "create",
      agentId,
      authResult.user!.user.user_id,
      changes,
      `Agent passport created ${
        ownerType === "org" ? "for organization" : "for user"
      } ${body.owner_id}`
    );

    // Get previous hash for audit chain
    const prevHash = await getLastActionHash(kv, agentId);

    // Create passport through TenantDO
    const result = await tenantDO.createPassport(passport);

    // Also write passport data directly to KV (since TenantDO stub doesn't write to KV)
    await kv.put(`passport:${agentId}`, JSON.stringify(passport));

    // Write agent routing information to KV for fast routing
    // This is critical for multi-region/multi-tenant verify endpoints
    const region = tenant.region || "US";
    await writeAgentRouting(kv, agentId, ownerId, region, 1);

    // Complete audit action
    const completedAuditAction = await completeAuditAction(
      auditAction,
      prevHash,
      env.REGISTRY_PRIVATE_KEY || ""
    );

    // Update indexes
    await updateIndexes(kv, agentId, passport.slug, passport.name);

    // Write agent routing information for verify endpoint
    // Write to both tenant-specific KV and default KV for compatibility
    try {
      // Write to tenant-specific KV
      await writeAgentRouting(kv, agentId, ownerId, tenant.region || "US", 1);
      console.log("Agent routing written to tenant KV successfully:", {
        agentId,
        ownerId,
        region: tenant.region,
      });

      // Also write to default KV for verify endpoint compatibility
      await writeAgentRouting(
        env.ai_passport_registry,
        agentId,
        ownerId,
        tenant.region || "US",
        1
      );
      console.log("Agent routing written to default KV successfully:", {
        agentId,
        ownerId,
        region: tenant.region,
      });
    } catch (error) {
      console.error("Failed to write agent routing:", error);
      // Don't fail the request, just log the error
    }

    // Schedule KV refresh and R2 backup asynchronously
    scheduleKVRefresh({
      agentId: result.agent_id,
      passportData: result,
      kv: bindings.kv || env.ai_passport_registry,
      env,
      ctx,
    });

    scheduleR2Backup(
      result.agent_id,
      result,
      bindings.r2 || env.APORT_R2,
      tenant.region || "US",
      env,
      ctx
    );
    console.log("result", result);

    // Return success response with CORS headers
    const responseData = {
      ok: true,
      message: "Passport created successfully",
      success: true,
      ...result,
      audit_id: completedAuditAction.id,
      requestId,
    };

    return new Response(JSON.stringify(responseData), {
      status: 201,
      headers: {
        "Content-Type": "application/json",
        ...cors(request),
      },
    });
  } catch (error) {
    console.log("Passport creation failed", {
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

// ============================================================================
// Validation
// ============================================================================

async function validateCreatePassportRequest(
  body: any,
  env: any,
  isAdmin: boolean = false
): Promise<{ valid: boolean; error?: string }> {
  // Required fields according to CreatePassportRequest interface
  const required = [
    "name",
    "role",
    "description",
    "contact",
    "controller_type",
    "regions",
    "status",
  ];
  for (const field of required) {
    if (!body[field]) {
      return { valid: false, error: `Missing required field: ${field}` };
    }
  }

  // Validate agent_id format if provided (should be auto-generated)
  if (body.agent_id && !body.agent_id.startsWith("ap_")) {
    return { valid: false, error: "agent_id must start with 'ap_'" };
  }

  // Validate owner_id format using ValidationUtils
  if (body.owner_id && !ValidationUtils.validateOwnerId(body.owner_id)) {
    return { valid: false, error: ERROR_MESSAGES.INVALID_OWNER_ID };
  }

  // Validate email format using ValidationUtils
  if (body.contact && !ValidationUtils.validateEmail(body.contact)) {
    return { valid: false, error: ERROR_MESSAGES.INVALID_EMAIL };
  }

  // Validate status using ValidationUtils
  if (body.status && !ValidationUtils.validateStatus(body.status)) {
    return { valid: false, error: ERROR_MESSAGES.INVALID_STATUS };
  }

  // Validate controller_type
  if (
    body.controller_type &&
    !["org", "person"].includes(body.controller_type)
  ) {
    return { valid: false, error: "controller_type must be 'org' or 'person'" };
  }

  // Validate regions
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

  // For non-admin users, filter out admin-only fields instead of failing
  if (!isAdmin) {
    // Remove admin-only fields from the body for non-admin users
    const filteredBody = { ...body };
    for (const field of ValidationUtils.ADMIN_ONLY_FIELDS) {
      delete filteredBody[field];
    }
    // Update the body to use the filtered version
    Object.assign(body, filteredBody);
  } else {
    // For admin users, validate admin-only fields
    const adminValidation = ValidationUtils.validateAdminFields(body, isAdmin);
    if (!adminValidation.valid) {
      return { valid: false, error: adminValidation.error };
    }
  }

  // Validate assurance level changes (admin-only for high levels)
  if (body.assurance_level) {
    const assuranceValidation = ValidationUtils.validateAssuranceLevelChange(
      "L0", // Default current level for new passports
      body.assurance_level,
      isAdmin
    );
    if (!assuranceValidation.valid) {
      // For non-admin users, reset to default instead of failing
      if (!isAdmin) {
        body.assurance_level = "L1"; // Default for non-admin users
      } else {
        return { valid: false, error: assuranceValidation.error };
      }
    }
  }

  // Validate verification status changes (admin-only)
  if (body.verification_status) {
    const verificationValidation =
      ValidationUtils.validateVerificationStatusChange(
        "unverified", // Default current status for new passports
        body.verification_status,
        isAdmin
      );
    if (!verificationValidation.valid) {
      // For non-admin users, reset to default instead of failing
      if (!isAdmin) {
        body.verification_status = "unverified"; // Default for non-admin users
      } else {
        return { valid: false, error: verificationValidation.error };
      }
    }
  }

  // Validate source field changes (admin-only for "admin" source)
  if (body.source) {
    const sourceValidation = ValidationUtils.validateSourceChange(
      "form", // Default current source for new passports
      body.source,
      isAdmin
    );
    if (!sourceValidation.valid) {
      // For non-admin users, reset to default instead of failing
      if (!isAdmin) {
        body.source = "form"; // Default for non-admin users
      } else {
        return { valid: false, error: sourceValidation.error };
      }
    }
  }

  // Validate MCP config if provided
  if (body.mcp_config) {
    const mcpValidation = validateMCPConfig(body.mcp_config);
    if (!mcpValidation.valid) {
      return {
        valid: false,
        error: `MCP config validation failed: ${mcpValidation.errors?.join(
          ", "
        )}`,
      };
    }
  }

  return { valid: true };
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
