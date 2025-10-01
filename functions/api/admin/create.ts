import {
  BaseApiHandler,
  BaseEnv,
  createApiHandler,
} from "../../utils/base-api-handler";
import { cors } from "../../utils/cors";
import { R2Bucket } from "@cloudflare/workers-types";
import {
  preSerializePassport,
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
  validateAndResolveOwner,
  updateOwnerAgentsIndex,
  updateOrgAgentsIndex,
} from "../../utils/owner-utils";
import { PassportData, Capability } from "../../../types/passport";
import { AssuranceLevel, AssuranceMethod } from "../../../types/auth";
import { PassportCategory, PassportFramework } from "../../utils/taxonomy";
import { validateMCPConfig } from "../../utils/mcp-validation";
import { computePassportEvaluation } from "../../utils/policy-evaluation";

// Import shared utilities to avoid duplication
import {
  generateAgentId,
  generateSlug,
  normalizeName,
  findUniqueSlug,
  isNameUnique,
  updateIndexes,
} from "../../utils/passport-common";
import {
  generateTemplateId,
  generateInstanceId,
} from "../../utils/template-instance";

/**
 * components:
 *   schemas:
 *     AdminPassport:
 *       type: object
 *       required:
 *         - agent_id
 *         - owner
 *         - role
 *         - permissions
 *         - regions
 *         - status
 *         - contact
 *       properties:
 *         agent_id:
 *           type: string
 *           description: Unique identifier for the AI agent
 *           example: "aeebc92d-13fb-4e23-8c3c-1aa82b167da6"
 *         owner:
 *           type: string
 *           description: Organization or individual who owns the agent
 *           example: "Acme Corp"
 *         role:
 *           type: string
 *           description: Functional role or tier of the agent
 *           example: "Tier-1"
 *         permissions:
 *           type: array
 *           items:
 *             type: string
 *           description: Array of permissions granted to the agent
 *           example: ["read:tickets", "create:tickets"]
 *         limits:
 *           type: object
 *           additionalProperties: true
 *           description: Operational limits and constraints
 *           example:
 *             ticket_creation_daily: 25
 *         regions:
 *           type: array
 *           items:
 *             type: string
 *           description: Geographic regions where the agent operates
 *           example: ["US-CA", "US-NY"]
 *         status:
 *           type: string
 *           enum: [active, suspended, revoked]
 *           description: Initial status of the agent
 *           example: "active"
 *         contact:
 *           type: string
 *           description: Contact information for the agent owner
 *           example: "admin@acme.com"
 *         version:
 *           type: string
 *           description: Passport schema version (optional)
 *           example: "1.0.0"
 *     CreatePassportResponse:
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
 *           example: "Agent passport created successfully"
 *         agent_id:
 *           type: string
 *           description: Created agent ID
 *           example: "aeebc92d-13fb-4e23-8c3c-1aa82b167da6"
 *         key:
 *           type: string
 *           description: Storage key for the passport
 *           example: "passport:aeebc92d-13fb-4e23-8c3c-1aa82b167da6"
 *     ValidationError:
 *       type: object
 *       required:
 *         - error
 *         - message
 *       properties:
 *         error:
 *           type: string
 *           description: Error code
 *           example: "bad_request"
 *         message:
 *           type: string
 *           description: Error message
 *           example: "Missing required fields"
 *         missing_fields:
 *           type: array
 *           items:
 *             type: string
 *           description: List of missing required fields
 *           example: ["agent_id", "owner"]
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *       description: Admin token for authentication
 */

interface Env extends BaseEnv {
  PASSPORT_SNAPSHOTS_BUCKET?: R2Bucket;
  AP_VERSION: string;
  REGISTRY_PRIVATE_KEY: string;
}

interface CreatePassportRequest {
  // Core Identity (agent_id and slug are auto-generated)
  name: string;
  owner_id: string;
  owner_type: "org" | "user";
  owner_display: string;
  controller_type: "org" | "person";
  claimed?: boolean;

  // Agent Details
  role: string;
  description: string;
  capabilities?: Capability[];
  limits?: Record<string, any>;
  regions: string[];

  // Status & Verification
  status: "draft" | "active" | "suspended" | "revoked";
  verification_status?: "unverified" | "email_verified" | "github_verified";
  verification_method?: "email" | "github_oauth";
  verification_evidence?: Record<string, any>;

  // Assurance
  assurance_level?: "L0" | "L1" | "L2" | "L3" | "L4KYC" | "L4FIN";
  assurance_method?:
    | "self_attested"
    | "email_verified"
    | "github_verified"
    | "domain_verified"
    | "kyc_verified"
    | "kyb_verified"
    | "financial_data_verified";
  assurance_verified_at?: string;

  // Contact & Links
  contact: string;
  links?: {
    homepage?: string;
    docs?: string;
    repo?: string;
  };

  // Categorization & Metadata
  framework?: string[];
  categories?: string[];
  logo_url?: string;

  // System Metadata
  source?: "admin" | "form" | "crawler";
  version?: string;

  // Template/Instance Support
  kind?: "template" | "instance";
  creator_id?: string;
  creator_type?: "org" | "user";
}

/**
 * /api/admin/create:
 *   post:
 *     summary: Create a new agent passport
 *     description: Create a new AI agent passport (admin only)
 *     operationId: createAgent
 *     tags:
 *       - Admin
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AdminPassport'
 *           example:
 *             agent_id: "aeebc92d-13fb-4e23-8c3c-1aa82b167da6"
 *             owner: "Acme Corp"
 *             role: "Tier-1"
 *             permissions: ["read:tickets", "create:tickets"]
 *             limits:
 *               ticket_creation_daily: 25
 *             regions: ["US-CA", "US-NY"]
 *             status: "active"
 *             contact: "admin@acme.com"
 *     responses:
 *       201:
 *         description: Agent passport created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreatePassportResponse'
 *             example:
 *               ok: true
 *               message: "Agent passport created successfully"
 *               agent_id: "aeebc92d-13fb-4e23-8c3c-1aa82b167da6"
 *               key: "passport:aeebc92d-13fb-4e23-8c3c-1aa82b167da6"
 *       400:
 *         description: Invalid request data
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/ValidationError'
 *                 - $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               missing_fields:
 *                 summary: Missing required fields
 *                 value:
 *                   error: "bad_request"
 *                   message: "Missing required fields"
 *                   missing_fields: ["agent_id", "owner"]
 *               invalid_status:
 *                 summary: Invalid status
 *                 value:
 *                   error: "bad_request"
 *                   message: "Invalid status. Must be one of: active, suspended, revoked"
 *       401:
 *         description: Unauthorized - invalid admin token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "unauthorized"
 *       409:
 *         description: Agent passport already exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "passport_already_exists"
 *                 agent_id:
 *                   type: string
 *                   example: "aeebc92d-13fb-4e23-8c3c-1aa82b167da6"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "internal_server_error"
 *               message: "Failed to create agent passport"
 */
class CreatePassportHandler extends BaseApiHandler {
  async handleRequest(): Promise<Response> {
    const body = (await this.request.json().catch(() => ({}))) as any;

    // Validate required fields
    const requiredFields = [
      "name",
      "controller_type",
      "role",
      "description",
      "regions",
      "status",
      "contact",
    ];
    const validationError = this.validateRequiredFields(body, requiredFields);
    if (validationError) return validationError;

    // Validate status
    const statusError = this.validateStatus(body.status);
    if (statusError) return statusError;

    // Validate capabilities if provided
    if (body.capabilities && body.capabilities.length > 0) {
      const capabilityIds = body.capabilities.map((cap: any) => cap.id || cap);
      const capabilityError = this.validateCapabilities(capabilityIds);
      if (capabilityError) return capabilityError;

      // Validate capability params if provided
      for (const capability of body.capabilities) {
        if (capability.params) {
          const paramError = await this.validateCapabilityParams(
            capability.id || capability,
            capability.params
          );
          if (paramError) return paramError;
        }
      }
    }

    // Validate limits if provided
    if (body.limits) {
      const limitsError = this.validateLimits(body.limits);
      if (limitsError) return limitsError;
    }

    // Validate categories if provided
    if (body.categories && body.categories.length > 0) {
      const categoriesError = this.validateCategories(body.categories);
      if (categoriesError) return categoriesError;
    }

    // Validate frameworks if provided
    if (body.framework && body.framework.length > 0) {
      const frameworksError = this.validateFrameworks(body.framework);
      if (frameworksError) return frameworksError;
    }

    // Validate assurance level if provided
    if (body.assurance_level) {
      const assuranceError = this.validateAssuranceLevel(body.assurance_level);
      if (assuranceError) return assuranceError;
    }

    // Validate assurance method if provided
    if (body.assurance_method) {
      const methodError = this.validateAssuranceMethod(body.assurance_method);
      if (methodError) return methodError;
    }

    // Validate regions if provided
    if (body.regions && body.regions.length > 0) {
      const regionsError = this.validateRegions(body.regions);
      if (regionsError) return regionsError;
    }

    // Validate owner_id if provided
    if (body.owner_id) {
      // Special case for admin interface: allow system owners
      if (
        body.owner_id === "ap_admin_system" ||
        body.owner_id === "ap_org_system"
      ) {
        // System owners are valid for admin interface
      } else {
        const ownerType = body.owner_id.startsWith("ap_org_") ? "org" : "user";
        const ownerValidation = await validateAndResolveOwner(
          this.env.ai_passport_registry,
          body.owner_id,
          ownerType
        );

        if (!ownerValidation.valid) {
          return this.badRequest(ownerValidation.error || "Invalid owner");
        }
      }
    } else {
      return this.badRequest("owner_id is required for the new owner model");
    }

    // Generate agent_id and slug based on kind
    const agentId =
      body.kind === "template"
        ? generateTemplateId()
        : body.kind === "instance"
        ? generateInstanceId()
        : generateAgentId(body.name, body.owner_id || "unknown");
    const baseSlug = generateSlug(body.name);
    const normalizedName = normalizeName(body.name);
    const key = `passport:${agentId}`;

    // Check if passport already exists
    const existing = await this.env.ai_passport_registry.get(key, "json");
    if (existing) {
      return this.conflict("Agent passport already exists", {
        agent_id: agentId,
      });
    }

    // Find unique slug
    const slug = await findUniqueSlug(baseSlug, this.env.ai_passport_registry);

    // Check name uniqueness
    const nameIsUnique = await isNameUnique(
      normalizedName,
      this.env.ai_passport_registry
    );
    if (!nameIsUnique) {
      console.log(
        `Warning: Name "${body.name}" is not unique, but allowing creation`
      );
    }

    // Resolve owner information
    let ownerInfo = null;
    if (body.owner_id) {
      // Special case for admin interface: allow creating system owners
      if (
        body.owner_id === "ap_admin_system" ||
        body.owner_id === "ap_org_system"
      ) {
        ownerInfo = {
          owner_id: body.owner_id,
          owner_type: body.owner_id.startsWith("ap_org_") ? "org" : "user",
          owner_display: body.owner_display || "System Admin",
          assurance_level: "L0",
          assurance_method: "self_attested",
          assurance_verified_at: undefined,
        };
      } else {
        const ownerType = body.owner_id.startsWith("ap_org_") ? "org" : "user";
        const ownerValidation = await validateAndResolveOwner(
          this.env.ai_passport_registry,
          body.owner_id,
          ownerType
        );
        if (ownerValidation.valid) {
          ownerInfo = ownerValidation.ownerInfo;
        }
      }
    }

    // Validate MCP configuration if provided
    if (body.mcp) {
      const mcpValidation = validateMCPConfig(body.mcp);
      if (!mcpValidation.valid) {
        return this.badRequest(
          `MCP validation failed: ${mcpValidation.errors.join(", ")}`
        );
      }
      // Use sanitized MCP data
      body.mcp = mcpValidation.sanitized;
    }

    // Prepare passport data
    const now = new Date().toISOString();
    const passportData: PassportData = {
      // Core Identity
      agent_id: agentId,
      slug: slug,
      name: body.name,
      owner_id: body.owner_id,
      owner_type: (ownerInfo?.owner_type ||
        (body.owner_id?.startsWith("ap_org_") ? "org" : "user")) as
        | "user"
        | "org",
      owner_display: ownerInfo?.owner_display || body.owner_id,
      controller_type: body.controller_type,
      claimed: false,

      // Agent Details
      role: body.role,
      description: body.description,
      capabilities: body.capabilities || [],
      limits: body.limits || {},
      regions: body.regions || [],

      // Status & Verification
      status: body.status,
      verification_status: body.verification_status || "unverified",
      verification_method: body.verification_method,

      // Assurance (snapshot from owner)
      assurance_level: (ownerInfo?.assurance_level || "L0") as AssuranceLevel,
      assurance_method: ownerInfo?.assurance_method as
        | AssuranceMethod
        | undefined,
      assurance_verified_at: ownerInfo?.assurance_verified_at,

      // Contact & Links
      contact: body.contact,
      links: body.links || {},

      // Categorization & Metadata
      categories: (body.categories || []) as PassportCategory[],
      framework: (body.framework || []) as PassportFramework[],
      logo_url: body.logo_url,

      // MCP (Model Context Protocol) Support
      mcp: body.mcp,

      // System Metadata
      source: body.source || "admin",
      created_at: now,
      updated_at: now,
      version: body.version || this.env.AP_VERSION,

      // Template/Instance Support
      kind: body.kind || "template",
      creator_id: body.creator_id || body.owner_id,
      creator_type: body.creator_type || body.owner_type,

      // Registry fields (will be populated if signing succeeds)
      registry_key_id: undefined,
      registry_sig: undefined,
      canonical_hash: undefined,
      verified_at: undefined,
    };

    // Compute policy evaluation
    try {
      const evaluation = await computePassportEvaluation(
        passportData,
        this.env.ai_passport_registry
      );
      passportData.evaluation = evaluation;
    } catch (error) {
      console.warn("Failed to compute policy evaluation:", error);
      // Continue without evaluation
    }

    // Sign passport if status is active
    if (body.status === "active" && this.env.REGISTRY_PRIVATE_KEY) {
      try {
        const signedPassport = await signPassport(
          passportData,
          this.env.REGISTRY_PRIVATE_KEY,
          "registry-key-1" // Default key ID
        );
        Object.assign(passportData, signedPassport);
      } catch (error) {
        console.error("Failed to sign passport:", error);
      }
    }

    // Create audit action
    const changes = computePassportDiffs(null, passportData);
    const auditAction = await createAuditAction(
      "create",
      agentId,
      "admin",
      changes,
      "Agent passport created via admin interface"
    );

    const prevHash = await getLastActionHash(
      this.env.ai_passport_registry,
      agentId
    );
    const completedAuditAction = await completeAuditAction(
      auditAction,
      prevHash,
      this.env.REGISTRY_PRIVATE_KEY || ""
    );

    // Use unified passport update optimizer for optimized creation
    const { createPassportUpdateOptimizer } = await import(
      "../../utils/passport-update-optimizer"
    );
    const updateOptimizer = createPassportUpdateOptimizer(
      this.env.ai_passport_registry,
      this.env.AP_VERSION || "0.1",
      this.env.PASSPORT_SNAPSHOTS_BUCKET // R2 bucket for backups
    );

    // Create passport with backup (this handles KV storage and backup)
    const createResult = await updateOptimizer.createPassport(passportData, {
      createBackup: true,
      preWarmCache: true,
      reason: "Agent passport created via admin interface",
      actor: "admin",
    });

    // Additional admin-specific operations in parallel
    const storagePromises = [
      // Update indexes
      updateIndexes(
        this.env.ai_passport_registry,
        agentId,
        slug,
        normalizedName
      ),
      // Pre-serialize for edge performance
      preSerializePassport(
        this.env.ai_passport_registry,
        agentId,
        passportData,
        this.env.AP_VERSION || "1.0.0"
      ),
      // Store audit action
      storeAuditAction(this.env.ai_passport_registry, completedAuditAction),
    ];

    // Add owner index updates
    if (passportData.owner_id) {
      storagePromises.push(
        updateOwnerAgentsIndex(
          this.env.ai_passport_registry,
          passportData.owner_id,
          agentId,
          "add"
        )
      );

      if (passportData.owner_type === "org") {
        storagePromises.push(
          updateOrgAgentsIndex(
            this.env.ai_passport_registry,
            passportData.owner_id,
            agentId,
            "add"
          )
        );
      }
    }

    // Add R2 snapshot creation if bucket is available
    if (this.env.PASSPORT_SNAPSHOTS_BUCKET) {
      const passport = buildPassportObject(
        passportData,
        this.env.AP_VERSION || "1.0.0"
      );
      const r2Key = `passports/${agentId}.json`;
      storagePromises.push(
        this.env.PASSPORT_SNAPSHOTS_BUCKET.put(
          r2Key,
          JSON.stringify(passport),
          {
            httpMetadata: {
              contentType: "application/json",
              cacheControl: "public, max-age=300",
            },
          }
        ).then(() => {})
      );
    }

    // Execute all storage operations
    await Promise.all(storagePromises);

    // Purge verify cache
    await purgeVerifyCache(
      agentId,
      this.env.APP_BASE_URL || "https://aport.io",
      this.env.CLOUDFLARE_API_TOKEN,
      this.env.CLOUDFLARE_ZONE_ID
    );

    return this.created(
      {
        ok: true,
        message: "Agent passport created successfully",
        agent_id: agentId,
        key: `passport:${agentId}`,
        created_at: createResult.updatedAt,
        latency: createResult.latency,
        backup_created: createResult.backupCreated,
      },
      "Agent passport created successfully"
    );
  }
}

// Export handlers
export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const handler = new CreatePassportHandler(request, env, {
    allowedMethods: ["POST"],
    requireAuth: true,
    rateLimitRpm: 100,
    rateLimitType: "admin",
  });
  return handler.execute();
};
