import { cors } from "../../utils/cors";
import { createLogger } from "../../utils/logger";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";

interface Env {
  ai_passport_registry: KVNamespace;
  ADMIN_TOKEN: string;
}

/**
 * @swagger
 * /api/metrics:
 *   get:
 *     summary: Get system metrics
 *     description: Retrieve system performance metrics and statistics (admin only)
 *     operationId: getMetrics
 *     tags:
 *       - Admin
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: timeWindow
 *         in: query
 *         description: Time window in hours (default: 24)
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 168
 *           default: 24
 *     responses:
 *       200:
 *         description: Metrics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalRequests:
 *                   type: integer
 *                   description: Total number of requests in time window
 *                 errorRate:
 *                   type: number
 *                   description: Error rate percentage (5xx responses)
 *                 p95Latency:
 *                   type: number
 *                   description: 95th percentile latency in milliseconds
 *                 p99Latency:
 *                   type: number
 *                   description: 99th percentile latency in milliseconds
 *                 averageLatency:
 *                   type: number
 *                   description: Average latency in milliseconds
 *                 statusCounts:
 *                   type: object
 *                   additionalProperties:
 *                     type: integer
 *                   description: Count of requests by status code
 *                 routeCounts:
 *                   type: object
 *                   additionalProperties:
 *                     type: integer
 *                   description: Count of requests by route
 *                 timeWindow:
 *                   type: integer
 *                   description: Time window in hours
 *                 generatedAt:
 *                   type: string
 *                   format: date-time
 *                   description: When metrics were generated
 *             example:
 *               totalRequests: 1250
 *               errorRate: 0.24
 *               p95Latency: 85
 *               p99Latency: 120
 *               averageLatency: 45
 *               statusCounts:
 *                 "200": 1200
 *                 "404": 30
 *                 "429": 15
 *                 "500": 5
 *               routeCounts:
 *                 "/api/verify": 800
 *                 "/api/verify-compact": 300
 *                 "/api/admin/create": 50
 *                 "/api/admin/agents": 100
 *               timeWindow: 24
 *               generatedAt: "2024-01-15T10:30:00Z"
 *       401:
 *         description: Unauthorized - invalid admin token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "unauthorized"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "internal_server_error"
 *               message: "Failed to retrieve metrics"
 */
export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const startTime = Date.now();
  const headers = cors(request);
  const logger = createLogger(env.ai_passport_registry);

  // Authentication check
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env.ADMIN_TOKEN}`) {
    const response = new Response(
      JSON.stringify({
        error: "unauthorized",
        message: "Invalid or missing admin token",
      }),
      {
        status: 401,
        headers: { "content-type": "application/json", ...headers },
      }
    );

    await logger.logRequest(request, response, startTime);
    return response;
  }

  try {
    // Get time window from query parameter (default: 24 hours)
    const url = new URL(request.url);
    const timeWindowHours = parseInt(
      url.searchParams.get("timeWindow") || "24"
    );
    const timeWindowMs = timeWindowHours * 60 * 60 * 1000;

    // Get metrics
    const metrics = await logger.getMetrics(timeWindowMs);

    const response = new Response(
      JSON.stringify({
        ...metrics,
        timeWindow: timeWindowHours,
        generatedAt: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-cache",
          ...headers,
        },
      }
    );

    // Don't log metrics API calls to avoid circular counting
    // await logger.logRequest(request, response, startTime);
    return response;
  } catch (error) {
    console.error("Error retrieving metrics:", error);
    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to retrieve metrics",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json", ...headers },
      }
    );

    // Don't log metrics API calls to avoid circular counting
    // await logger.logError(request, error as Error);
    return response;
  }
};
