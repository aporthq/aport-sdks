/**
 * Region Details API Endpoint
 *
 * Provides detailed information about a specific region including
 * configuration status, bindings, and capabilities.
 */

import { cors } from "../../utils/cors";
import { createLogger } from "../../utils/logger";
import { ErrorHandler } from "../../utils/error-handler";
import { MultiRegionEnv } from "../../types/env";
import {
  getRegionConfig,
  isRegionAvailable,
  validateRegionConfig,
  getRegionBindings,
} from "../../utils/region-config";

interface Env extends MultiRegionEnv {
  // Additional fields specific to this endpoint
}

interface RegionDetailsResponse {
  region: {
    code: string;
    name: string;
    displayName: string;
    country: string;
    timezone: string;
    status: string;
    compliance: string[];
    features: string[];
    sla: {
      uptime: string;
      latency: string;
      support: string;
    };
    limits: {
      maxTenants: number;
      maxPassports: number;
      maxRequestsPerMonth: number;
    };
    pricing: {
      tier: string;
      costPerTenant: number;
      costPerRequest: number;
    };
  };
  configuration: {
    available: boolean;
    configured: boolean;
    bindings: {
      d1: {
        available: boolean;
        binding: string;
      };
      kv: {
        available: boolean;
        binding: string;
      };
      r2: {
        available: boolean;
        binding: string;
      };
    };
    missing: string[];
    availableBindings: string[];
  };
  bindings: {
    d1?: any;
    kv?: any;
    r2?: any;
  };
}

/**
 * /api/regions/{region_code}:
 *   get:
 *     summary: Get region details
 *     description: Returns detailed information about a specific region including configuration status, bindings, and capabilities.
 *     operationId: getRegionDetails
 *     tags:
 *       - Regions
 *       - Multi-Region
 *     parameters:
 *       - name: region_code
 *         in: path
 *         required: true
 *         description: The region code (e.g., US, EU, CA)
 *         schema:
 *           type: string
 *           enum: [US, EU, CA, AP, AU, BR]
 *           example: "EU"
 *     responses:
 *       200:
 *         description: Region details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RegionDetailsResponse'
 *       404:
 *         description: Region not found
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
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const corsHeaders = cors(request);
  const logger = createLogger(env.ai_passport_registry);

  try {
    const startTime = performance.now();
    const regionCode = params?.region_code as string;

    if (!regionCode) {
      return ErrorHandler.createValidationError("Region code is required");
    }

    // Get region configuration
    const region = getRegionConfig(regionCode);
    if (!region) {
      return ErrorHandler.createNotFoundError(`Region ${regionCode}`);
    }

    // Validate region configuration
    const validation = validateRegionConfig(env, regionCode);
    const isAvailable = isRegionAvailable(regionCode);
    const bindings = getRegionBindings(env, regionCode);

    // Build response
    const response: RegionDetailsResponse = {
      region: {
        code: region.code,
        name: region.name,
        displayName: region.displayName,
        country: region.country,
        timezone: region.timezone,
        status: region.status,
        compliance: region.compliance,
        features: region.features,
        sla: region.sla,
        limits: region.limits,
        pricing: region.pricing,
      },
      configuration: {
        available: isAvailable,
        configured: validation.valid,
        bindings: {
          d1: {
            available: validation.available.includes("d1"),
            binding: region.bindings.d1,
          },
          kv: {
            available: validation.available.includes("kv"),
            binding: region.bindings.kv,
          },
          r2: {
            available: validation.available.includes("r2"),
            binding: region.bindings.r2,
          },
        },
        missing: validation.missing,
        availableBindings: validation.available,
      },
      bindings: {
        d1: bindings.d1 ? "configured" : "missing",
        kv: bindings.kv ? "configured" : "missing",
        r2: bindings.r2 ? "configured" : "missing",
      },
    };

    const totalTime = performance.now() - startTime;

    logger.logRequest(request, new Response("OK", { status: 200 }), startTime, {
      clientIP: request.headers.get("CF-Connecting-IP") || "unknown",
      userAgent: request.headers.get("user-agent") || undefined,
      cfRay: request.headers.get("cf-ray") || undefined,
      isBot: request.headers.get("user-agent")?.includes("bot") || false,
      isBrowser:
        request.headers.get("user-agent")?.includes("Mozilla") || false,
      latency: totalTime,
    });

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300", // 5 minutes cache
        ...corsHeaders,
      },
    });
  } catch (error) {
    await ErrorHandler.logError(
      logger,
      "Error fetching region details",
      error,
      {
        regionCode: params?.region_code,
      }
    );

    return ErrorHandler.createErrorResponse(
      "internal_server_error",
      "Failed to retrieve region details",
      500
    );
  }
};

export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { headers: cors(request) });
