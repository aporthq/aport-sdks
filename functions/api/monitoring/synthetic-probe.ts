import { cors } from "../../utils/cors";
import { createLogger } from "../../utils/logger";
import {
  storeMetric,
  generateSyntheticProbe,
  generateVerifyLatencyMetric,
  generateVerifySuccessMetric,
  generateVerifyErrorMetric,
} from "../../utils/metrics";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";

/**
 * Calculate percentile for performance metrics
 */
function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = (percentile / 100) * (sorted.length - 1);

  if (Number.isInteger(index)) {
    return sorted[index];
  }

  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

interface Env {
  ai_passport_registry: KVNamespace;
  AP_VERSION: string;
  VERIFY_RPM?: string;
  PASSPORT_SNAPSHOTS_BUCKET?: R2Bucket;
}

interface SyntheticProbeRequest {
  agent_ids: string[];
  regions: string[];
  probe_type?: "verify" | "health";
}

/**
 * @swagger
 * components:
 *   schemas:
 *     SyntheticProbeRequest:
 *       type: object
 *       required:
 *         - agent_ids
 *         - regions
 *       properties:
 *         agent_ids:
 *           type: array
 *           items:
 *             type: string
 *           description: List of agent IDs to probe
 *           example: ["ap_128094d3", "ap_456"]
 *         regions:
 *           type: array
 *           items:
 *             type: string
 *           description: List of regions to probe from
 *           example: ["us-east-1", "eu-west-1", "ap-southeast-1"]
 *         probe_type:
 *           type: string
 *           enum: [verify, health]
 *           description: Type of probe to perform
 *           example: "verify"
 *     SyntheticProbeResponse:
 *       type: object
 *       required:
 *         - ok
 *         - message
 *         - results
 *       properties:
 *         ok:
 *           type: boolean
 *           description: Success status
 *           example: true
 *         message:
 *           type: string
 *           description: Success message
 *           example: "Synthetic probes completed"
 *         results:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               agent_id:
 *                 type: string
 *                 example: "ap_128094d3"
 *               region:
 *                 type: string
 *                 example: "us-east-1"
 *               success:
 *                 type: boolean
 *                 example: true
 *               latency:
 *                 type: number
 *                 example: 45
 *               error:
 *                 type: string
 *                 example: null
 */

export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const startTime = Date.now();
  const headers = cors(request);
  const logger = createLogger(env.ai_passport_registry);

  try {
    const body = (await request.json()) as SyntheticProbeRequest;

    if (
      !body.agent_ids ||
      !Array.isArray(body.agent_ids) ||
      body.agent_ids.length === 0
    ) {
      const response = new Response(
        JSON.stringify({ error: "missing_agent_ids" }),
        {
          status: 400,
          headers: { "content-type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    if (
      !body.regions ||
      !Array.isArray(body.regions) ||
      body.regions.length === 0
    ) {
      const response = new Response(
        JSON.stringify({ error: "missing_regions" }),
        {
          status: 400,
          headers: { "content-type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    const probeType = body.probe_type || "verify";
    const results: Array<{
      agent_id: string;
      region: string;
      success: boolean;
      latency: number;
      requestTime?: number;
      dnsTime?: number;
      cacheSource?: string;
      cacheLatency?: number;
      responseSize?: number;
      serverTiming?: string;
      aportCache?: string;
      cfCacheStatus?: string;
      error?: string;
    }> = [];

    const metrics: any[] = [];

    // Perform synthetic probes with warming steps for accurate measurement
    const probePromises = [];

    for (const agentId of body.agent_ids) {
      for (const region of body.regions) {
        probePromises.push(
          (async () => {
            const baseUrl = new URL(request.url).origin;
            const verifyUrl = `${baseUrl}/api/verify/${encodeURIComponent(
              agentId
            )}`;

            // WARMING STEP: Hit once to warm caches
            try {
              await fetch(verifyUrl, {
                method: "GET",
                headers: {
                  Accept: "application/json",
                  "User-Agent": `Synthetic-Probe-Warm/${region}`,
                  "X-Probe-Region": region,
                  "X-Probe-Type": "warm",
                },
                signal: AbortSignal.timeout(5000),
              });
            } catch (error) {
              // Ignore warming errors, continue with measurement
            }

            // MEASUREMENT STEP: Now measure the warmed performance
            const probeStartTime = Date.now();
            const dnsStartTime = Date.now();

            try {
              // DNS resolution simulation (minimal overhead)
              const dnsTime = Date.now() - dnsStartTime;

              // Make actual HTTP request like the web app
              const requestStartTime = Date.now();
              const probeResponse = await fetch(verifyUrl, {
                method: "GET",
                headers: {
                  Accept: "application/json",
                  "User-Agent": `Synthetic-Probe/${region}`,
                  "X-Probe-Region": region,
                  "X-Probe-Type": probeType,
                  "X-Probe-Start": probeStartTime.toString(),
                },
                // Add timeout like the web app
                signal: AbortSignal.timeout(10000), // 10s timeout
              });

              const requestTime = Date.now() - requestStartTime;
              const totalLatency = Date.now() - probeStartTime;
              const success = probeResponse.ok;

              // Parse response to get detailed cache and timing information
              let cacheSource = "unknown";
              let cacheLatency = 0;
              let responseSize = 0;
              let serverTiming = "";
              let aportCache = "";
              let cfCacheStatus = "";

              if (success) {
                const responseText = await probeResponse.text();
                responseSize = responseText.length;
                cacheSource =
                  probeResponse.headers.get("x-cache-source") || "unknown";
                cacheLatency = parseInt(
                  probeResponse.headers.get("x-cache-latency") || "0"
                );
                serverTiming = probeResponse.headers.get("server-timing") || "";
                aportCache = probeResponse.headers.get("aport-cache") || "";
                cfCacheStatus =
                  probeResponse.headers.get("cf-cache-status") || "";
              }

              return {
                agent_id: agentId,
                region,
                success,
                latency: totalLatency,
                requestTime,
                dnsTime,
                cacheSource,
                cacheLatency,
                responseSize,
                serverTiming,
                aportCache,
                cfCacheStatus,
                error: success ? undefined : `HTTP ${probeResponse.status}`,
              };
            } catch (error) {
              const totalLatency = Date.now() - probeStartTime;
              const errorMessage =
                error instanceof Error ? error.message : "Unknown error";

              return {
                agent_id: agentId,
                region,
                success: false,
                latency: totalLatency,
                requestTime: 0,
                dnsTime: 0,
                cacheSource: "error",
                cacheLatency: 0,
                responseSize: 0,
                serverTiming: "",
                aportCache: "",
                cfCacheStatus: "",
                error: errorMessage,
              };
            }
          })()
        );
      }
    }

    // Execute all probes in parallel
    const probeResults = await Promise.all(probePromises);

    // Process results and generate metrics
    for (const result of probeResults) {
      results.push(result);

      // Generate metrics based on result
      if (result.success) {
        metrics.push(
          generateSyntheticProbe(
            result.agent_id,
            result.region,
            result.latency,
            true
          ),
          generateVerifySuccessMetric(
            result.agent_id,
            result.region,
            `Synthetic-Probe/${result.region}`,
            "synthetic"
          ),
          generateVerifyLatencyMetric(
            result.agent_id,
            result.latency,
            result.region,
            `Synthetic-Probe/${result.region}`,
            "synthetic"
          )
        );
      } else {
        metrics.push(
          generateSyntheticProbe(
            result.agent_id,
            result.region,
            result.latency,
            false,
            result.error
          ),
          generateVerifyErrorMetric(
            result.agent_id,
            result.error || "Unknown error",
            result.region,
            `Synthetic-Probe/${result.region}`,
            "synthetic"
          )
        );
      }
    }

    // Store all metrics
    if (metrics.length > 0) {
      await storeMetric(env.ai_passport_registry, {
        timestamp: new Date().toISOString(),
        metric_type: "synthetic_probe",
        value: metrics.length,
        metadata: {
          probe_type: probeType,
          total_probes: results.length,
          successful_probes: results.filter((r) => r.success).length,
          failed_probes: results.filter((r) => !r.success).length,
        },
      });
    }

    // Calculate enhanced performance metrics with proper P95 definition
    const successfulProbes = results.filter((r) => r.success);
    const failedProbes = results.filter((r) => !r.success);
    const latencies = results.map((r) => r.latency).sort((a, b) => a - b);

    // P95 Definition: 95% of requests are faster than this value
    // This is the honest, industry-standard definition
    const p95_latency = calculatePercentile(latencies, 95);
    const p99_latency = calculatePercentile(latencies, 99);
    const p50_latency = calculatePercentile(latencies, 50);

    // Cache status breakdown
    const cacheBreakdown = {
      l1_hits: results.filter((r) => r.cacheSource === "l1").length,
      l2_hits: results.filter((r) => r.cacheSource === "l2").length,
      l3_hits: results.filter((r) => r.cacheSource === "l3").length,
      unknown: results.filter((r) => r.cacheSource === "unknown").length,
      errors: results.filter((r) => r.cacheSource === "error").length,
    };

    // Aport cache status breakdown
    const aportCacheBreakdown = {
      HIT: results.filter((r) => r.aportCache === "HIT").length,
      MISS: results.filter((r) => r.aportCache === "MISS").length,
      REVALIDATED: results.filter((r) => r.aportCache === "REVALIDATED").length,
      unknown: results.filter((r) => !r.aportCache || r.aportCache === "")
        .length,
    };

    // Cloudflare cache status breakdown
    const cfCacheBreakdown = {
      HIT: results.filter((r) => r.cfCacheStatus === "HIT").length,
      MISS: results.filter((r) => r.cfCacheStatus === "MISS").length,
      DYNAMIC: results.filter((r) => r.cfCacheStatus === "DYNAMIC").length,
      BYPASS: results.filter((r) => r.cfCacheStatus === "BYPASS").length,
      unknown: results.filter((r) => !r.cfCacheStatus || r.cfCacheStatus === "")
        .length,
    };

    const performanceMetrics = {
      // Basic metrics
      total_probes: results.length,
      successful_probes: successfulProbes.length,
      failed_probes: failedProbes.length,
      success_rate: (successfulProbes.length / results.length) * 100,

      // Latency metrics (honest P95 definition)
      avg_latency: latencies.reduce((sum, l) => sum + l, 0) / latencies.length,
      min_latency: Math.min(...latencies),
      max_latency: Math.max(...latencies),
      p50_latency: p50_latency,
      p95_latency: p95_latency,
      p99_latency: p99_latency,

      // P95 Definition for clarity
      p95_definition:
        "95% of requests are faster than this value (industry standard)",

      // Detailed timing breakdown
      avg_request_time:
        successfulProbes.reduce((sum, r) => sum + (r.requestTime || 0), 0) /
        successfulProbes.length,
      avg_dns_time:
        successfulProbes.reduce((sum, r) => sum + (r.dnsTime || 0), 0) /
        successfulProbes.length,
      avg_response_size:
        successfulProbes.reduce((sum, r) => sum + (r.responseSize || 0), 0) /
        successfulProbes.length,
      avg_cache_latency:
        successfulProbes.reduce((sum, r) => sum + (r.cacheLatency || 0), 0) /
        successfulProbes.length,

      // Cache performance breakdown
      cache_breakdown: cacheBreakdown,
      aport_cache_breakdown: aportCacheBreakdown,
      cf_cache_breakdown: cfCacheBreakdown,

      // Performance targets and assessment
      performance_targets: {
        ideal_p95: "≤ 100ms (global, warmed)",
        acceptable_p95: "≤ 150-300ms (global, cold)",
        current_p95: `${p95_latency.toFixed(1)}ms`,
        target_met: p95_latency <= 100,
        recommendation:
          p95_latency <= 100
            ? "✅ Target met"
            : p95_latency <= 300
            ? "⚠️ Acceptable"
            : "❌ Needs optimization",
      },
    };

    const response = new Response(
      JSON.stringify({
        ok: true,
        message: "Synthetic probes completed",
        results,
        summary: performanceMetrics,
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          ...headers,
        },
      }
    );

    await logger.logRequest(request, response, startTime);
    return response;
  } catch (error) {
    console.error("Error performing synthetic probes:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to perform synthetic probes",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json", ...headers },
      }
    );

    await logger.logRequest(request, response, startTime);
    return response;
  }
};
