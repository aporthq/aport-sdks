/**
 * Regions API Endpoint
 *
 * Provides information about available regions, their capabilities,
 * and configuration status for multi-region and multi-tenant support.
 */

import { cors } from "../../utils/cors";
import { createLogger } from "../../utils/logger";
import { ErrorHandler } from "../../utils/error-handler";
import { MultiRegionEnv } from "../../types/env";
import {
  getRegionsByStatus,
  getRegionConfig,
  getAvailableRegions,
  getRegionsForUI,
  isRegionAvailable,
  validateRegionConfig,
  getDefaultRegion,
  getConfiguredRegions,
  PLATFORM_CAPABILITIES,
} from "../../utils/region-config";

interface Env extends MultiRegionEnv {
  // Additional fields specific to this endpoint
}

interface RegionStatusResponse {
  regions: {
    available: Array<{
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
      configured: boolean;
      bindings: {
        d1: boolean;
        kv: boolean;
        r2: boolean;
      };
    }>;
    upcoming: Array<{
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
    }>;
    private: Array<{
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
    }>;
  };
  capabilities: {
    dataResidency: boolean;
    privateInstances: boolean;
    customDomains: boolean;
    customBranding: boolean;
    migrationSupport: boolean;
    crossRegionVerification: boolean;
    auditLogging: boolean;
    webhookSupport: boolean;
  };
  configuration: {
    defaultRegion: string;
    configuredRegions: string[];
    totalRegions: number;
    availableRegions: number;
  };
}

/**
 * /api/regions:
 *   get:
 *     summary: Get available regions and capabilities
 *     description: Returns information about available regions, their capabilities, configuration status, and platform features for multi-region and multi-tenant support.
 *     operationId: getRegions
 *     tags:
 *       - Regions
 *       - Multi-Region
 *     responses:
 *       200:
 *         description: Regions information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RegionStatusResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const corsHeaders = cors(request);
  const logger = createLogger(env.ai_passport_registry);

  try {
    const startTime = performance.now();

    // Get region status
    const regionStatus = getRegionsByStatus();
    const defaultRegion = getDefaultRegion(env);
    const configuredRegions = getConfiguredRegions(env);

    // Build response with configuration status
    const response: RegionStatusResponse = {
      regions: {
        available: regionStatus.available.map((region) => {
          const validation = validateRegionConfig(env, region.code);
          return {
            code: region.code,
            name: region.name,
            displayName: region.displayName,
            country: region.country,
            timezone: region.timezone,
            compliance: region.compliance,
            features: region.features,
            sla: region.sla,
            limits: region.limits,
            pricing: region.pricing,
            configured: validation.valid,
            bindings: {
              d1: validation.available.includes("d1"),
              kv: validation.available.includes("kv"),
              r2: validation.available.includes("r2"),
            },
          };
        }),
        upcoming: regionStatus.upcoming.map((region) => ({
          code: region.code,
          name: region.name,
          displayName: region.displayName,
          country: region.country,
          timezone: region.timezone,
          compliance: region.compliance,
          features: region.features,
          sla: region.sla,
          limits: region.limits,
          pricing: region.pricing,
        })),
        private: regionStatus.private.map((region) => ({
          code: region.code,
          name: region.name,
          displayName: region.displayName,
          country: region.country,
          timezone: region.timezone,
          compliance: region.compliance,
          features: region.features,
          sla: region.sla,
          limits: region.limits,
          pricing: region.pricing,
        })),
      },
      capabilities: PLATFORM_CAPABILITIES,
      configuration: {
        defaultRegion: defaultRegion,
        configuredRegions: configuredRegions,
        totalRegions: Object.keys(regionStatus).reduce(
          (sum, status) =>
            sum + regionStatus[status as keyof typeof regionStatus].length,
          0
        ),
        availableRegions: regionStatus.available.length,
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
    await ErrorHandler.logError(logger, "Error fetching regions", error);

    return ErrorHandler.createErrorResponse(
      "internal_server_error",
      "Failed to retrieve regions information",
      500
    );
  }
};

export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { headers: cors(request) });
