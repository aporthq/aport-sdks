import { cors } from "../../utils/cors";
import { createLogger } from "../../utils/logger";
import {
  calculateAggregatedMetrics,
  calculateSLOData,
  checkSLOBreach,
} from "../../utils/metrics";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";

interface Env {
  ai_passport_registry: KVNamespace;
  AP_VERSION: string;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     MetricsResponse:
 *       type: object
 *       required:
 *         - ok
 *         - metrics
 *         - slo_data
 *         - slo_breach
 *       properties:
 *         ok:
 *           type: boolean
 *           description: Success status
 *           example: true
 *         metrics:
 *           type: object
 *           properties:
 *             period:
 *               type: string
 *               example: "day"
 *             start_time:
 *               type: string
 *               example: "2024-01-01T00:00:00Z"
 *             end_time:
 *               type: string
 *               example: "2024-01-02T00:00:00Z"
 *             total_requests:
 *               type: number
 *               example: 10000
 *             success_rate:
 *               type: number
 *               example: 99.9
 *             error_rate:
 *               type: number
 *               example: 0.1
 *             p50_latency:
 *               type: number
 *               example: 50
 *             p95_latency:
 *               type: number
 *               example: 80
 *             p99_latency:
 *               type: number
 *               example: 120
 *             avg_latency:
 *               type: number
 *               example: 60
 *             blocked_attempts:
 *               type: number
 *               example: 5
 *             avg_approval_time:
 *               type: number
 *               example: 2000
 *             top_agents:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   agent_id:
 *                     type: string
 *                     example: "aeebc92d-13fb-4e23-8c3c-1aa82b167da6"
 *                   requests:
 *                     type: number
 *                     example: 1000
 *             region_breakdown:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   region:
 *                     type: string
 *                     example: "us-east-1"
 *                   requests:
 *                     type: number
 *                     example: 5000
 *                   avg_latency:
 *                     type: number
 *                     example: 55
 *         slo_data:
 *           type: object
 *           properties:
 *             period:
 *               type: string
 *               example: "2024-01-01T00:00:00Z to 2024-01-02T00:00:00Z"
 *             availability:
 *               type: number
 *               example: 99.9
 *             p95_latency:
 *               type: number
 *               example: 80
 *             error_rate:
 *               type: number
 *               example: 0.1
 *             mtts:
 *               type: number
 *               example: 60
 *             blocked_attempts:
 *               type: number
 *               example: 5
 *             total_requests:
 *               type: number
 *               example: 10000
 *         slo_breach:
 *           type: object
 *           properties:
 *             breached:
 *               type: boolean
 *               example: false
 *             breaches:
 *               type: array
 *               items:
 *                 type: string
 *               example: []
 */

export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const startTime = Date.now();
  const headers = cors(request);
  const logger = createLogger(env.ai_passport_registry);

  try {
    const url = new URL(request.url);
    const period =
      (url.searchParams.get("period") as "hour" | "day" | "week" | "month") ||
      "day";
    const hours = parseInt(url.searchParams.get("hours") || "24");

    // Calculate time range
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

    // Create cache key for this time range
    const cacheKey = `metrics:${period}:${hours}h:${Math.floor(
      startTime.getTime() / (5 * 60 * 1000)
    )}`; // 5-minute cache windows

    // Try to get cached metrics first
    let metrics;
    let isCached = false;
    try {
      const cachedMetrics = await env.ai_passport_registry.get(
        cacheKey,
        "json"
      );
      if (cachedMetrics) {
        console.log("Using cached metrics");
        metrics = cachedMetrics;
        isCached = true;
      }
    } catch (error) {
      console.log("Cache miss or error, calculating fresh metrics");
    }

    // If no cached data, calculate fresh metrics
    if (!metrics) {
      console.log("Calculating fresh metrics...");
      metrics = await calculateAggregatedMetrics(
        env.ai_passport_registry,
        startTime,
        endTime,
        period
      );

      // Cache the results for 5 minutes
      try {
        await env.ai_passport_registry.put(cacheKey, JSON.stringify(metrics), {
          expirationTtl: 300, // 5 minutes
        });
        console.log("Cached metrics for 5 minutes");
      } catch (error) {
        console.error("Failed to cache metrics:", error);
      }
    }

    // Get SLO data
    const sloData = await calculateSLOData(
      env.ai_passport_registry,
      startTime,
      endTime
    );

    // Check for SLO breaches
    const sloBreach = checkSLOBreach(sloData);

    // Calculate enhanced performance metrics
    const enhancedMetrics = {
      ...metrics,
      // P95 Definition for clarity
      p95_definition:
        "95% of requests are faster than this value (industry standard)",

      // Performance targets and assessment
      performance_targets: {
        ideal_p95: "≤ 100ms (global, warmed)",
        acceptable_p95: "≤ 150-300ms (global, cold)",
        current_p95: `${(metrics as any).p95_latency}ms`,
        target_met: (metrics as any).p95_latency <= 100,
        recommendation:
          (metrics as any).p95_latency <= 100
            ? "✅ Target met"
            : (metrics as any).p95_latency <= 300
            ? "⚠️ Acceptable"
            : "❌ Needs optimization",
      },

      // Performance assessment
      performance_assessment: {
        latency_grade:
          (metrics as any).p95_latency <= 50
            ? "A"
            : (metrics as any).p95_latency <= 100
            ? "B"
            : (metrics as any).p95_latency <= 200
            ? "C"
            : "D",
        reliability_grade:
          (metrics as any).success_rate >= 99.9
            ? "A"
            : (metrics as any).success_rate >= 99.5
            ? "B"
            : (metrics as any).success_rate >= 99.0
            ? "C"
            : "D",
        overall_grade:
          (metrics as any).p95_latency <= 100 &&
          (metrics as any).success_rate >= 99.5
            ? "A"
            : (metrics as any).p95_latency <= 200 &&
              (metrics as any).success_rate >= 99.0
            ? "B"
            : "C",
      },
    };

    const response = new Response(
      JSON.stringify({
        ok: true,
        metrics: enhancedMetrics,
        slo_data: sloData,
        slo_breach: sloBreach,
        generated_at: new Date().toISOString(),
        cached: isCached, // Indicate if data was cached
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "public, max-age=300", // Cache for 5 minutes
          "x-metrics-cached": isCached ? "true" : "false",
          ...headers,
        },
      }
    );

    // Don't log metrics API calls to avoid circular counting
    // await logger.logRequest(request, response, startTime);
    return response;
  } catch (error) {
    console.error("Error fetching metrics:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to fetch metrics",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json", ...headers },
      }
    );

    // Don't log metrics API calls to avoid circular counting
    // await logger.logRequest(request, response, startTime);
    return response;
  }
};
