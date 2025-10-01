import { cors } from "../../../utils/cors";
import { createLogger } from "../../../utils/logger";
import { createCache } from "../../../utils/cache";
import { createVerifyRateLimiter } from "../../../utils/rate-limit";
import { buildPassportObject } from "../../../utils/serialization";
import { authMiddleware } from "../../../utils/auth-middleware";
import { ApiResponse, HTTP_STATUS } from "../../../utils/api-response";
import {
  verifyInstallToken,
  markTokenAsUsed,
  InstallTokenPayload,
} from "../../../utils/install-token";
import {
  generateInstanceId,
  createInstanceFromTemplate,
  createInstanceIndexes,
  isTemplateId,
  findInstanceByTenant,
  listTemplateInstances,
} from "../../../utils/template-instance";
import {
  sendWebhook,
  createInstanceCreatedPayload,
  WebhookConfig,
} from "../../../utils/webhook";
import {
  createAuditAction,
  completeAuditAction,
  storeAuditAction,
  getLastActionHash,
  computePassportDiffs,
} from "../../../utils/audit-trail";
import {
  updateOwnerAgentsIndex,
  updateOrgAgentsIndex,
} from "../../../utils/owner-utils";
import {
  KVNamespace,
  R2Bucket,
  PagesFunction,
} from "@cloudflare/workers-types";
import { PassportData } from "../../../../types/passport";

interface CreateInstanceRequest {
  // Platform and tenant info
  platform_id: string; // e.g. "gorgias", "zendesk"
  tenant_ref: string; // platform's tenant identifier

  // Controller info (who controls this instance)
  controller_id: string; // tenant org/user id
  controller_type: "org" | "user";

  // Overrides for instance-specific settings (only allowed keys)
  overrides?: {
    limits?: Record<string, any>;
    regions?: string[];
    status?: "draft" | "active" | "suspended" | "revoked";
    contact?: string;
    links?: {
      homepage?: string;
      docs?: string;
      repo?: string;
    };
  };

  // Install token authentication (alternative to API key)
  install_token?: InstallTokenPayload;
  agent_data?: {
    name?: string;
    description?: string;
    capabilities?: string[];
    limits?: Record<string, any>;
    regions?: string[];
    assurance_level?: string;
  };
}

/**
 * @swagger
 * /api/passports/{template_id}/instances:
 *   post:
 *     summary: Create an instance of a template passport
 *     description: Creates a new instance passport based on an existing template
 *     operationId: createPassportInstance
 *     tags:
 *       - Passports
 *     parameters:
 *       - in: path
 *         name: template_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Template passport ID
 *         example: "agt_tmpl_abc123"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - platform_id
 *               - tenant_ref
 *               - controller_id
 *               - controller_type
 *             properties:
 *               platform_id:
 *                 type: string
 *                 description: Platform identifier
 *                 example: "gorgias"
 *               tenant_ref:
 *                 type: string
 *                 description: Platform's tenant identifier
 *                 example: "tenant_123"
 *               controller_id:
 *                 type: string
 *                 description: Controller org/user ID
 *                 example: "ap_org_456"
 *               controller_type:
 *                 type: string
 *                 enum: ["org", "user"]
 *                 description: Controller type
 *                 example: "org"
 *               limits:
 *                 type: object
 *                 description: Instance-specific limits overrides
 *               regions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Instance-specific regions
 *                 example: ["US-CA", "US-NY"]
 *               status:
 *                 type: string
 *                 enum: ["draft", "active", "suspended", "revoked"]
 *                 description: Instance status
 *                 example: "active"
 *               assurance_level:
 *                 type: string
 *                 description: Instance assurance level
 *                 example: "L2"
 *               contact:
 *                 type: string
 *                 description: Instance contact
 *                 example: "support@tenant.com"
 *               description:
 *                 type: string
 *                 description: Instance description
 *                 example: "Gorgias instance for Acme Corp"
 *     responses:
 *       201:
 *         description: Instance created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Instance created successfully"
 *                 instance_id:
 *                   type: string
 *                   example: "agt_inst_def456"
 *                 template_id:
 *                   type: string
 *                   example: "agt_tmpl_abc123"
 *                 key:
 *                   type: string
 *                   example: "passport:agt_inst_def456"
 *       400:
 *         description: Invalid request data
 *       404:
 *         description: Template not found
 *       500:
 *         description: Internal server error
 */
export const onRequestOptions: PagesFunction<{
  ai_passport_registry: KVNamespace;
  PASSPORT_SNAPSHOTS_BUCKET: R2Bucket;
  WEBHOOK_URL?: string;
  WEBHOOK_SECRET?: string;
  REGISTRY_PRIVATE_KEY?: string;
  JWT_SECRET: string;
}> = async (context) => {
  const { request } = context;
  const corsHeaders = cors(request);

  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
};

export const onRequestGet: PagesFunction<{
  ai_passport_registry: KVNamespace;
  PASSPORT_SNAPSHOTS_BUCKET: R2Bucket;
  WEBHOOK_URL?: string;
  WEBHOOK_SECRET?: string;
  REGISTRY_PRIVATE_KEY?: string;
  JWT_SECRET: string;
}> = async (context) => {
  const { request, env, params } = context;
  const templateId = params.template_id as string;
  const logger = createLogger(env.ai_passport_registry as KVNamespace);

  // CORS headers
  const corsHeaders = cors(request);

  // Initialize response handler
  const response = new ApiResponse(corsHeaders, env.ai_passport_registry);

  try {
    // Authenticate user (allow both JWT and API key)
    const authResult = await authMiddleware(request, env as any, {
      requireAuth: true,
      allowApiKey: true,
      requiredApiKeyScopes: ["read"],
    });
    if (!authResult.success) {
      return response.error(
        {
          error: "unauthorized",
          message: "Authentication required",
        },
        401
      );
    }

    // Validate template ID format
    if (!isTemplateId(templateId)) {
      return response.badRequest(
        "Invalid template ID format. Must start with 'agt_tmpl_'"
      );
    }

    // Get query parameters
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") || undefined;
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") || "20"),
      100
    );

    // Check if template exists
    const templateKey = `passport:${templateId}`;
    const templateData = await env.ai_passport_registry.get(
      templateKey,
      "json"
    );

    if (!templateData) {
      return response.error(
        {
          error: "not_found",
          message: "Template not found",
        },
        404
      );
    }

    // Get instances with pagination
    const { instanceIds, nextCursor } = await listTemplateInstances(
      env.ai_passport_registry as KVNamespace,
      templateId,
      cursor
    );

    // Limit results
    const limitedInstanceIds = instanceIds.slice(0, limit);

    // Get instance details
    const instances = await Promise.all(
      limitedInstanceIds.map(async (instanceId) => {
        try {
          const instanceKey = `passport:${instanceId}`;
          const instanceData = await env.ai_passport_registry.get(
            instanceKey,
            "json"
          );

          if (!instanceData) {
            return null;
          }

          return {
            instance_id: (instanceData as any).agent_id,
            platform_id: (instanceData as any).platform_id,
            tenant_ref: (instanceData as any).tenant_ref,
            controller_id: (instanceData as any).controller_id,
            controller_type: (instanceData as any).controller_type,
            status: (instanceData as any).status,
            created_at: (instanceData as any).created_at,
            updated_at: (instanceData as any).updated_at,
          };
        } catch (error) {
          console.warn("Failed to get instance data", {
            instanceId,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      })
    );

    // Filter out null results
    const validInstances = instances.filter(Boolean);

    console.log("Listed instances", {
      template_id: templateId,
      count: validInstances.length,
      has_next: !!nextCursor,
    });

    return response.success(
      {
        instances: validInstances,
        next_cursor: nextCursor,
        total_count: validInstances.length,
      },
      200,
      "Instances retrieved successfully"
    );
  } catch (error) {
    console.error("Error listing instances", {
      error: error instanceof Error ? error.message : String(error),
    });
    const errorResponse = new ApiResponse(
      corsHeaders,
      env.ai_passport_registry
    );
    return errorResponse.error(
      {
        error: "internal_server_error",
        message: "Internal server error",
      },
      500
    );
  }
};

export const onRequestPost: PagesFunction<{
  ai_passport_registry: KVNamespace;
  PASSPORT_SNAPSHOTS_BUCKET: R2Bucket;
  WEBHOOK_URL?: string;
  WEBHOOK_SECRET?: string;
  REGISTRY_PRIVATE_KEY?: string;
  JWT_SECRET: string;
  AP_VERSION: string;
}> = async (context) => {
  const { request, env, params } = context;
  const templateId = params.template_id as string;
  const logger = createLogger(env.ai_passport_registry);
  const cache = createCache(env.ai_passport_registry);

  // CORS headers
  const corsHeaders = cors(request);

  // Initialize response handler
  const response = new ApiResponse(corsHeaders, env.ai_passport_registry);

  try {
    // Parse request body first to check for install token
    const body: CreateInstanceRequest = await request.json();

    let authResult;
    let installToken: InstallTokenPayload | null = null;

    // Check if using install token authentication
    if (body.install_token) {
      // Verify install token
      const tokenResult = await verifyInstallToken(
        body.install_token as any,
        env
      );

      if (!tokenResult.valid) {
        return response.badRequest(tokenResult.error!, undefined, {
          error_code: "invalid_install_token",
        });
      }

      installToken = tokenResult;
      // For install tokens, we still need to authenticate the user
      // The install token only provides platform/tenant info, not user auth
      authResult = await authMiddleware(request, env as any, {
        requireAuth: true,
        allowApiKey: false, // Don't allow API keys with install tokens
        requiredApiKeyScopes: [],
      });
    } else {
      // Use traditional authentication (JWT or API key)
      authResult = await authMiddleware(request, env as any, {
        requireAuth: true,
        allowApiKey: true,
        requiredApiKeyScopes: ["issue"],
      });
    }

    if (!authResult.success) {
      return response.error(
        {
          error: "unauthorized",
          message: "Authentication required",
        },
        401
      );
    }

    // Validate template ID format
    if (!isTemplateId(templateId)) {
      return response.badRequest(
        "Invalid template ID format. Must start with 'agt_tmpl_'"
      );
    }

    // Validate required fields based on authentication method
    if (installToken) {
      // For install token, use token data and require minimal fields
      if (!body.agent_data) {
        return response.badRequest("Missing required field: agent_data", [
          "agent_data",
        ]);
      }

      // Use token data for platform info, but user info for owner/controller
      body.platform_id = installToken.platform_id;
      body.tenant_ref = installToken.tenant_ref;
      // Set controller to the authenticated user
      body.controller_id =
        authResult.user?.user.user_id ||
        installToken.controller_hint ||
        installToken.tenant_ref;
      body.controller_type = authResult.user?.user.user_id ? "user" : "org";
    } else {
      // For traditional auth, require all fields
      if (
        !body.platform_id ||
        !body.tenant_ref ||
        !body.controller_id ||
        !body.controller_type
      ) {
        return response.badRequest(
          "Missing required fields: platform_id, tenant_ref, controller_id, controller_type",
          ["platform_id", "tenant_ref", "controller_id", "controller_type"]
        );
      }
    }

    // Get template passport
    const templateKey = `passport:${templateId}`;
    const templateData = (await env.ai_passport_registry.get(
      templateKey,
      "json"
    )) as PassportData | null;

    if (!templateData) {
      return response.error(
        {
          error: "not_found",
          message: "Template not found",
        },
        404
      );
    }

    // Validate template is of kind "template"
    if (templateData.kind && templateData.kind !== "template") {
      return response.badRequest("Template must be of kind 'template'");
    }

    // Check if template is active
    if (
      templateData.status === "suspended" ||
      templateData.status === "revoked"
    ) {
      return response.badRequest(
        "Cannot create instance from suspended or revoked template"
      );
    }

    // Check if instance already exists for this platform + tenant
    const existingInstanceId = await findInstanceByTenant(
      env.ai_passport_registry,
      body.platform_id,
      body.tenant_ref
    );

    if (existingInstanceId) {
      return response.error(
        {
          error: "conflict",
          message: "Instance already exists for this platform and tenant",
          details: { existing_instance_id: existingInstanceId },
        },
        409
      );
    }

    // Generate instance ID
    const instanceId = generateInstanceId();

    // Create instance from template with overrides
    const overrides = body.overrides || {};
    const agentData = body.agent_data || {};

    // Determine if the instance should be claimed and active
    // If user is authenticated and will own the instance, mark as claimed and active
    const isUserOwned =
      authResult.user?.user.user_id &&
      authResult.user.user.user_id === body.controller_id;

    const instanceStatus = isUserOwned ? "active" : overrides.status || "draft";
    const isClaimed = isUserOwned ? true : false;

    const instanceData = createInstanceFromTemplate(templateData, {
      agent_id: instanceId,
      slug: `${templateData.slug}-${body.platform_id}-${body.tenant_ref}`,
      // Use agent_data if provided, otherwise use template data
      name: agentData.name || templateData.name,
      description: agentData.description || templateData.description,
      capabilities:
        (agentData.capabilities as any) || templateData.capabilities,
      limits: agentData.limits || overrides.limits || templateData.limits,
      regions: agentData.regions || overrides.regions || templateData.regions,
      assurance_level:
        (agentData.assurance_level as any) || templateData.assurance_level,
      status: instanceStatus,
      claimed: isClaimed,
      contact: overrides.contact || templateData.contact,
      links: overrides.links || templateData.links,
      // Template/instance fields
      kind: "instance",
      parent_agent_id: templateId,
      platform_id: body.platform_id,
      controller_id: body.controller_id,
      controller_type: body.controller_type,
      tenant_ref: body.tenant_ref,
      // Owner is the authenticated user
      owner_id: authResult.user?.user.user_id || body.controller_id,
      owner_type: authResult.user?.user.user_id ? "user" : "org",
      owner_display:
        authResult.user?.user.display_name ||
        authResult.user?.user.email ||
        body.controller_id,
      // Update timestamps
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Use unified passport update optimizer for optimized instance creation
    const { createPassportUpdateOptimizer } = await import(
      "../../../utils/passport-update-optimizer"
    );
    const updateOptimizer = createPassportUpdateOptimizer(
      env.ai_passport_registry,
      env.AP_VERSION || "0.1",
      env.PASSPORT_SNAPSHOTS_BUCKET // R2 bucket for backups
    );

    // Create instance passport with backup
    const createResult = await updateOptimizer.createPassport(instanceData, {
      createBackup: true,
      preWarmCache: true,
      reason: `Instance created from template ${templateId} for platform ${body.platform_id}`,
      actor: body.controller_id,
    });

    // Create audit action for instance issuance
    const changes = computePassportDiffs(null, instanceData);
    const auditAction = await createAuditAction(
      "issue_instance",
      instanceId,
      body.controller_id, // Use controller as actor
      changes,
      `Instance created from template ${templateId} for platform ${body.platform_id}`,
      {
        template_id: templateId,
        platform_id: body.platform_id,
        tenant_ref: body.tenant_ref,
        controller_id: body.controller_id,
        controller_type: body.controller_type,
      }
    );

    const prevHash = await getLastActionHash(
      env.ai_passport_registry,
      instanceId
    );
    const completedAuditAction = await completeAuditAction(
      auditAction,
      prevHash,
      env.REGISTRY_PRIVATE_KEY || ""
    );

    // Store audit action
    await storeAuditAction(env.ai_passport_registry, completedAuditAction);

    // Create index entries
    await createInstanceIndexes(
      env.ai_passport_registry,
      instanceId,
      templateId,
      body.platform_id,
      body.tenant_ref,
      body.controller_id
    );

    // Add instance to owner's passport index so it shows up in owner's passport list
    await updateOwnerAgentsIndex(
      env.ai_passport_registry,
      instanceData.owner_id,
      instanceId,
      "add"
    );

    // Add to org agents index if owner is an organization
    if (instanceData.owner_type === "org") {
      await updateOrgAgentsIndex(
        env.ai_passport_registry,
        instanceData.owner_id,
        instanceId,
        "add"
      );
    }

    // Pre-serialize for performance
    await preSerializePassport(
      env.ai_passport_registry,
      instanceId,
      instanceData,
      instanceData.version
    );

    // Send webhook notification (async, don't wait for response)
    const webhookConfig: WebhookConfig = {
      url: env.WEBHOOK_URL || "", // Configure webhook URL in environment
      secret: env.WEBHOOK_SECRET,
      retry_attempts: 3,
      retry_delay_ms: 1000,
      timeout_ms: 5000,
    };

    if (webhookConfig.url) {
      const webhookPayload = createInstanceCreatedPayload(
        instanceId,
        templateId,
        body.platform_id,
        body.tenant_ref,
        body.controller_id,
        body.controller_type,
        instanceData.status,
        instanceData.created_at
      );

      // Send webhook asynchronously (don't block response)
      sendWebhook(webhookConfig, webhookPayload).catch((error) => {
        console.warn("Webhook failed", {
          error: error.message,
          instance_id: instanceId,
        });
      });
    }

    // Mark install token as used if it was used for authentication
    if (installToken && body.install_token) {
      try {
        await markTokenAsUsed(body.install_token as any, env);
        logger.logAudit({
          type: "install_token_marked_as_used",
          nonce: installToken.nonce,
          instance_id: instanceId,
        });
      } catch (error) {
        logger.logAudit({
          type: "install_token_marking_failed",
          error: error instanceof Error ? error.message : String(error),
          nonce: installToken.nonce,
        });
      }
    }

    console.log("Instance created", {
      instance_id: instanceId,
      template_id: templateId,
      platform_id: body.platform_id,
      tenant_ref: body.tenant_ref,
      controller_id: body.controller_id,
    });

    return response.created(
      {
        message: "Instance created successfully",
        instance_id: instanceId,
        template_id: templateId,
        key: `passport:${instanceId}`,
        created_at: createResult.updatedAt,
        latency: createResult.latency,
        backup_created: createResult.backupCreated,
      },
      "Instance created successfully"
    );
  } catch (error) {
    console.error("Error creating instance", {
      error: error instanceof Error ? error.message : String(error),
    });
    const errorResponse = new ApiResponse(
      corsHeaders,
      env.ai_passport_registry
    );
    return errorResponse.error(
      {
        error: "internal_server_error",
        message: "Internal server error",
      },
      500
    );
  }
};

// Helper function to pre-serialize passport (imported from serialization utils)
async function preSerializePassport(
  kv: KVNamespace,
  agentId: string,
  rawPassport: PassportData,
  version: string
): Promise<void> {
  const passport = buildPassportObject(rawPassport, version);
  const serializedJson = JSON.stringify(passport);
  const etag = generateETag(passport);
  const registryKeyId = `kv-${Date.now()}`;

  const serializedData = {
    json: serializedJson,
    etag: etag,
    registryKeyId: registryKeyId,
    timestamp: Date.now(),
  };

  await kv.put(
    `passport_serialized:${agentId}`,
    JSON.stringify(serializedData),
    {
      expirationTtl: 86400, // 24 hours
    }
  );
}

// Helper function to generate ETag
function generateETag(passport: any): string {
  const etagData = `${passport.agent_id}-${passport.updated_at}-${passport.version}`;
  return `W/"${btoa(etagData).replace(
    /[+/=]/g,
    (m: string) =>
      ({ "+": "-", "/": "_", "=": "" }[
        m as keyof { "+": string; "/": string; "=": string }
      ])
  )}"`;
}
