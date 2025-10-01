/**
 * Tenant Creation API Endpoint
 *
 * Creates new tenants with region selection support for multi-region
 * and multi-tenant architecture.
 */

import { cors } from "../../utils/cors";
import { createLogger } from "../../utils/logger";
import { createTenantDOClientFromEnv } from "../../runtime/TenantDOClient";
import { resolveTenantBindings } from "../../runtime/region";
import { ErrorHandler } from "../../utils/error-handler";
import { MultiRegionEnv } from "../../types/env";
import {
  getRegionConfig,
  isRegionAvailable,
  validateRegionConfig,
} from "../../utils/region-config";

interface Env extends MultiRegionEnv {
  // Additional fields specific to this endpoint
}

interface CreateTenantRequest {
  name: string;
  slug: string;
  region: string;
  compliance_level?: "standard" | "enterprise" | "private";
  features?: string[];
  limits?: {
    maxPassports?: number;
    maxRequestsPerMonth?: number;
  };
  metadata?: Record<string, any>;
}

interface CreateTenantResponse {
  tenant: {
    id: string;
    name: string;
    slug: string;
    region: string;
    compliance_level: string;
    features: string[];
    limits: {
      maxPassports: number;
      maxRequestsPerMonth: number;
    };
    status: "active" | "suspended" | "pending";
    created_at: string;
    updated_at: string;
  };
  region: {
    code: string;
    name: string;
    displayName: string;
    country: string;
    timezone: string;
    compliance: string[];
    features: string[];
    sla: {
      uptime: string;
      latency: string;
      support: string;
    };
  };
  configuration: {
    configured: boolean;
    bindings: {
      d1: boolean;
      kv: boolean;
      r2: boolean;
    };
  };
}

/**
 * @swagger
 * /api/tenants:
 *   post:
 *     summary: Create a new tenant
 *     description: Creates a new tenant with region selection support for multi-region and multi-tenant architecture.
 *     operationId: createTenant
 *     tags:
 *       - Tenants
 *       - Multi-Region
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - slug
 *               - region
 *             properties:
 *               name:
 *                 type: string
 *                 description: Display name of the tenant
 *                 example: "Acme Corporation"
 *               slug:
 *                 type: string
 *                 description: URL-friendly identifier for the tenant
 *                 example: "acme-corp"
 *               region:
 *                 type: string
 *                 enum: [US, EU, CA, AP, AU, BR]
 *                 description: Region where tenant data will be stored
 *                 example: "EU"
 *               compliance_level:
 *                 type: string
 *                 enum: [standard, enterprise, private]
 *                 description: Compliance level for the tenant
 *                 default: "standard"
 *               features:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Enabled features for the tenant
 *                 example: ["audit", "webhooks", "gdpr"]
 *               limits:
 *                 type: object
 *                 properties:
 *                   maxPassports:
 *                     type: integer
 *                     description: Maximum number of passports allowed
 *                   maxRequestsPerMonth:
 *                     type: integer
 *                     description: Maximum API requests per month
 *               metadata:
 *                 type: object
 *                 description: Additional metadata for the tenant
 *     responses:
 *       201:
 *         description: Tenant created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreateTenantResponse'
 *       400:
 *         description: Bad request (e.g., invalid region, missing required fields)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Tenant with this slug already exists
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
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const corsHeaders = cors(request);
  const logger = createLogger(env.ai_passport_registry);

  try {
    const startTime = performance.now();

    // Parse request body
    const body: CreateTenantRequest = await request.json();

    // Validate required fields
    if (!body.name || !body.slug || !body.region) {
      return ErrorHandler.createValidationError(
        "Name, slug, and region are required"
      );
    }

    // Validate region
    const region = getRegionConfig(body.region);
    if (!region) {
      return ErrorHandler.createValidationError(
        `Region ${body.region} is not supported`,
        { region: body.region }
      );
    }

    // Check if region is available
    if (!isRegionAvailable(body.region)) {
      return ErrorHandler.createValidationError(
        `Region ${body.region} is not available for tenant creation`,
        { region: body.region, status: region.status }
      );
    }

    // Validate region configuration
    const validation = validateRegionConfig(env, body.region);
    if (!validation.valid) {
      return ErrorHandler.createRegionConfigError(
        body.region,
        validation.missing
      );
    }

    // Generate tenant ID
    const tenantId = `ap_org_${body.slug}_${Date.now()}`;
    const now = new Date().toISOString();

    // Create tenant data
    const tenantData = {
      tenant_id: tenantId,
      org_id: tenantId,
      name: body.name,
      slug: body.slug,
      region: body.region,
      compliance_level: body.compliance_level || "standard",
      features: body.features || region.features,
      limits: {
        maxPassports: body.limits?.maxPassports || region.limits.maxPassports,
        maxRequestsPerMonth:
          body.limits?.maxRequestsPerMonth || region.limits.maxRequestsPerMonth,
      },
      status: "active" as const,
      metadata: body.metadata || {},
      db_kind: "shared" as const,
      created_at: now,
      updated_at: now,
    };

    // Get region-specific bindings
    const regionBindings = resolveTenantBindings(env, tenantData);

    // Create tenant in region-specific D1
    const insertResult = await regionBindings.d1
      .prepare(
        `
        INSERT INTO organizations (
          id, name, slug, region, compliance_level, features, limits, 
          status, metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .bind(
        tenantData.tenant_id,
        tenantData.name,
        tenantData.slug,
        tenantData.region,
        tenantData.compliance_level,
        JSON.stringify(tenantData.features),
        JSON.stringify(tenantData.limits),
        tenantData.status,
        JSON.stringify(tenantData.metadata),
        tenantData.created_at,
        tenantData.updated_at
      )
      .run();

    if (!insertResult.success) {
      throw new Error("Failed to create tenant in database");
    }

    // Initialize tenant DO with region-specific bindings
    const tenantDO = createTenantDOClientFromEnv(env, tenantId, {
      timeout: 10000,
      maxRetries: 3,
    });

    await tenantDO.initializeTenant(tenantData);

    // Build response
    const response: CreateTenantResponse = {
      tenant: {
        id: tenantData.tenant_id,
        name: tenantData.name,
        slug: tenantData.slug,
        region: tenantData.region,
        compliance_level: tenantData.compliance_level,
        features: tenantData.features,
        limits: tenantData.limits,
        status: tenantData.status,
        created_at: tenantData.created_at,
        updated_at: tenantData.updated_at,
      },
      region: {
        code: region.code,
        name: region.name,
        displayName: region.displayName,
        country: region.country,
        timezone: region.timezone,
        compliance: region.compliance,
        features: region.features,
        sla: region.sla,
      },
      configuration: {
        configured: validation.valid,
        bindings: {
          d1: validation.available.includes("d1"),
          kv: validation.available.includes("kv"),
          r2: validation.available.includes("r2"),
        },
      },
    };

    const totalTime = performance.now() - startTime;

    logger.logRequest(request, new Response("OK", { status: 201 }), startTime, {
      clientIP: request.headers.get("CF-Connecting-IP") || "unknown",
      userAgent: request.headers.get("user-agent") || undefined,
      cfRay: request.headers.get("cf-ray") || undefined,
      isBot: request.headers.get("user-agent")?.includes("bot") || false,
      isBrowser:
        request.headers.get("user-agent")?.includes("Mozilla") || false,
      latency: totalTime,
    });

    return new Response(JSON.stringify(response), {
      status: 201,
      headers: {
        "Content-Type": "application/json",
        Location: `/api/tenants/${tenantId}`,
        ...corsHeaders,
      },
    });
  } catch (error) {
    await ErrorHandler.logError(logger, "Error creating tenant", error);

    return ErrorHandler.createErrorResponse(
      "internal_server_error",
      "Failed to create tenant",
      500
    );
  }
};

export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { headers: cors(request) });
