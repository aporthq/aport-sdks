import { PagesFunction } from "@cloudflare/workers-types";
import { cors } from "../utils/cors";
import { calculateSLOData, checkSLOBreach } from "../utils/metrics";

// Re-export Durable Object for Cloudflare to detect
export { TenantDO } from "../runtime/TenantDO";

interface Env {
  ai_passport_registry: KVNamespace;
}

/**
 * @swagger
 * /api/status:
 *   get:
 *     tags:
 *       - Monitoring
 *     summary: Get system status
 *     description: Returns current system status including SLO metrics and health
 *     responses:
 *       200:
 *         description: Status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [operational, degraded, outage]
 *                 slo_data:
 *                   type: object
 *                   properties:
 *                     p95_latency:
 *                       type: number
 *                     error_rate:
 *                       type: number
 *                     availability:
 *                       type: number
 *                 last_updated:
 *                   type: string
 *                   format: date-time
 */

export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const headers = cors(request);

  try {
    // Calculate SLO data for the last 24 hours
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const sloData = await calculateSLOData(
      env.ai_passport_registry,
      last24h,
      now
    );
    const sloBreach = checkSLOBreach(sloData);

    // Determine overall system status
    let status: "operational" | "degraded" | "outage" = "operational";
    if (sloBreach.breached) {
      const hasAvailabilityBreach = sloBreach.breaches.some((b) =>
        b.includes("availability")
      );

      if (hasAvailabilityBreach || sloData.availability < 95) {
        status = "outage";
      } else {
        status = "degraded";
      }
    }

    const response = new Response(
      JSON.stringify({
        status,
        slo_data: sloData,
        slo_breach: sloBreach,
        last_updated: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "public, max-age=30", // Cache for 30 seconds
          ...headers,
        },
      }
    );

    return response;
  } catch (error) {
    console.error("Error getting status:", error);

    const response = new Response(
      JSON.stringify({
        status: "outage",
        error: "Failed to determine system status",
        last_updated: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { "content-type": "application/json", ...headers },
      }
    );

    return response;
  }
};
