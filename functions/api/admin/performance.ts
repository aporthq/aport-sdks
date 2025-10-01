/**
 * Performance Statistics Endpoint
 * Provides cache performance metrics for monitoring
 */

import { cors } from "../../utils/cors";
import {
  getPerformanceStats,
  getRecentMetrics,
} from "../../utils/performance-monitor";
import { authMiddleware } from "../../utils/auth-middleware";
import { PagesFunction } from "@cloudflare/workers-types";

interface Env {
  ai_passport_registry: KVNamespace;
  ADMIN_TOKEN?: string;
  JWT_SECRET?: string;
  API_KEY_SECRET?: string;
}

/**
 * /api/admin/performance:
 *   get:
 *     summary: Get cache performance statistics
 *     description: Retrieve performance metrics for the tiered cache system
 *     operationId: getPerformanceStats
 *     tags:
 *       - Admin
 *       - Performance
 *     responses:
 *       200:
 *         description: Performance statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalRequests:
 *                   type: number
 *                   description: Total number of requests processed
 *                 avgLatency:
 *                   type: number
 *                   description: Average latency in milliseconds
 *                 p50Latency:
 *                   type: number
 *                   description: 50th percentile latency in milliseconds
 *                 p95Latency:
 *                   type: number
 *                   description: 95th percentile latency in milliseconds
 *                 p99Latency:
 *                   type: number
 *                   description: 99th percentile latency in milliseconds
 *                 cacheHitRate:
 *                   type: number
 *                   description: Overall cache hit rate (0-1)
 *                 l1HitRate:
 *                   type: number
 *                   description: L1 (memory) cache hit rate (0-1)
 *                 l2HitRate:
 *                   type: number
 *                   description: L2 (edge) cache hit rate (0-1)
 *                 l3HitRate:
 *                   type: number
 *                   description: L3 (KV) cache hit rate (0-1)
 *                 errorRate:
 *                   type: number
 *                   description: Error rate (0-1)
 *             example:
 *               totalRequests: 1000
 *               avgLatency: 25.5
 *               p50Latency: 15.2
 *               p95Latency: 45.8
 *               p99Latency: 89.3
 *               cacheHitRate: 0.85
 *               l1HitRate: 0.45
 *               l2HitRate: 0.30
 *               l3HitRate: 0.10
 *               errorRate: 0.02
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "internal_server_error"
 */

export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const headers = cors(request);

  try {
    // Check for admin token first (for admin pages)
    const auth = request.headers.get("authorization");
    if (auth === `Bearer ${env.ADMIN_TOKEN}`) {
      // Admin token authentication - proceed
    } else {
      // Try JWT/API key authentication for other users
      const authResult = await authMiddleware(request, env as any, {
        requireAuth: true,
        allowApiKey: true,
        requiredApiKeyScopes: ["admin", "monitoring"],
      });

      if (!authResult.success) {
        return new Response(
          JSON.stringify({
            error: "unauthorized",
            message: "Authentication required to access performance metrics",
          }),
          {
            status: 401,
            headers: {
              "content-type": "application/json",
              ...headers,
            },
          }
        );
      }
    }

    const stats = getPerformanceStats();
    const recentMetrics = getRecentMetrics(50); // Last 50 requests

    const response = {
      ...stats,
      recentMetrics: recentMetrics.map((metric) => ({
        timestamp: metric.timestamp,
        agentId: metric.agentId,
        cacheSource: metric.cacheSource,
        latency: metric.latency,
        cacheHit: metric.cacheHit,
      })),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-cache, no-store, must-revalidate",
        ...headers,
      },
    });
  } catch (error) {
    console.error("Failed to get performance stats:", error);

    return new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to retrieve performance statistics",
      }),
      {
        status: 500,
        headers: {
          "content-type": "application/json",
          ...headers,
        },
      }
    );
  }
};
