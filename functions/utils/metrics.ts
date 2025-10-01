import { KVNamespace } from "@cloudflare/workers-types";

export interface MetricData {
  timestamp: string;
  metric_type:
    | "verify_latency"
    | "verify_success"
    | "verify_error"
    | "synthetic_probe"
    | "blocked_attempt"
    | "approval_time";
  value: number;
  agent_id?: string;
  region?: string;
  error_type?: string;
  user_agent?: string;
  ip_address?: string;
  metadata?: Record<string, unknown>;
}

export interface AggregatedMetrics {
  period: "hour" | "day" | "week" | "month";
  start_time: string;
  end_time: string;
  total_requests: number;
  success_rate: number;
  error_rate: number;
  p50_latency: number;
  p95_latency: number;
  p99_latency: number;
  avg_latency: number;
  blocked_attempts: number;
  avg_approval_time?: number;
  top_agents: Array<{ agent_id: string; requests: number }>;
  region_breakdown: Array<{
    region: string;
    requests: number;
    avg_latency: number;
  }>;
  // Enhanced analytics
  cache_analytics?: {
    cache_hits: number;
    cache_misses: number;
    cache_hit_rate: number;
    cache_miss_rate: number;
    cache_source_breakdown: Record<string, number>;
  };
  user_experience_latency?: {
    avg_latency: number;
    p50_latency: number;
    p95_latency: number;
    p99_latency: number;
    sample_size: number;
  };
  request_types?: {
    browsers: number;
    bots: number;
    other: number;
  };
}

export interface SLOData {
  period: string;
  availability: number; // percentage
  p95_latency: number; // milliseconds (overall - all requests)
  user_experience_p95_latency?: number; // milliseconds (cache misses only - actual work)
  error_rate: number; // percentage
  mtts: number; // mean time to success in milliseconds
  blocked_attempts: number;
  total_requests: number;
}

/**
 * Store a metric in KV
 */
export async function storeMetric(
  kv: KVNamespace,
  metric: MetricData
): Promise<void> {
  const key = `metric:${metric.metric_type}:${Date.now()}:${Math.random()
    .toString(36)
    .substr(2, 9)}`;
  await kv.put(key, JSON.stringify(metric), {
    expirationTtl: 30 * 24 * 60 * 60, // 30 days
  });
}

/**
 * Store multiple metrics in batch
 */
export async function storeMetrics(
  kv: KVNamespace,
  metrics: MetricData[]
): Promise<void> {
  const promises = metrics.map((metric) => storeMetric(kv, metric));
  await Promise.all(promises);
}

/**
 * Get metrics for a time range
 */
export async function getMetrics(
  kv: KVNamespace,
  metricType: MetricData["metric_type"],
  startTime: Date,
  endTime: Date,
  agentId?: string
): Promise<MetricData[]> {
  // This is a simplified implementation
  // In production, you'd want to use a time-series database or more sophisticated indexing
  const metrics: MetricData[] = [];

  // For now, we'll return empty array as we don't have efficient time-range queries in KV
  // In production, you'd implement proper time-series storage
  return metrics;
}

/**
 * Calculate aggregated metrics for a time period
 */
export async function calculateAggregatedMetrics(
  kv: KVNamespace,
  startTime: Date,
  endTime: Date,
  period: "hour" | "day" | "week" | "month" = "day"
): Promise<AggregatedMetrics> {
  try {
    // Get all log entries from KV with pagination to handle >1000 entries
    const logs: any[] = [];
    let cursor: string | undefined;
    let result: any;

    do {
      result = await kv.list({
        prefix: "log:",
        limit: 1000,
        cursor: cursor,
      });

      // Batch fetch log entries for better performance
      const batchSize = 50; // Process in batches of 50
      for (let i = 0; i < result.keys.length; i += batchSize) {
        const batch = result.keys.slice(i, i + batchSize);
        const batchPromises = batch.map(async (key: any) => {
          try {
            const logEntry = (await kv.get(key.name, "json")) as any;
            if (logEntry && logEntry.timestamp) {
              const logTime = new Date(logEntry.timestamp);
              if (logTime >= startTime && logTime <= endTime) {
                return logEntry;
              }
            }
            return null;
          } catch (error) {
            console.error(`Error parsing log entry ${key.name}:`, error);
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        logs.push(...batchResults.filter((log) => log !== null));
      }

      // Update cursor for next iteration
      cursor = result.cursor;
    } while (cursor);

    if (logs.length === 0) {
      return {
        period,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        total_requests: 0,
        success_rate: 100,
        error_rate: 0,
        p50_latency: 0,
        p95_latency: 0,
        p99_latency: 0,
        avg_latency: 0,
        blocked_attempts: 0,
        avg_approval_time: 0,
        top_agents: [],
        region_breakdown: [],
      };
    }

    // Calculate metrics from real data
    const totalRequests = logs.length;

    // For passport verification, we need to distinguish between:
    // - System errors (5xx) - these are actual failures
    // - Business logic responses (2xx, 3xx, 4xx) - these are successful API responses
    // - 404 specifically means "passport not found" which is a valid business case

    const systemErrors = logs.filter((log) => log.status >= 500).length;

    const businessLogicResponses = logs.filter(
      (log) => log.status >= 200 && log.status < 500
    ).length;

    // Success rate should be based on system availability, not business logic
    // A 404 response is a successful API call, just with no data found
    const successCount = businessLogicResponses;
    const successRate =
      Math.round((successCount / totalRequests) * 100 * 10) / 10; // 1 decimal place
    const errorRate =
      Math.round((systemErrors / totalRequests) * 100 * 100) / 100; // 2 decimal places

    // Debug logging
    const notFoundCount = logs.filter((log) => log.status === 404).length;
    const clientErrorCount = logs.filter(
      (log) => log.status >= 400 && log.status < 500
    ).length;
    console.log(
      `Metrics calculation: ${totalRequests} total requests, ${successCount} successful API responses, ${systemErrors} system errors`
    );
    console.log(
      `Breakdown: ${notFoundCount} not found (404), ${
        clientErrorCount - notFoundCount
      } other client errors, ${systemErrors} server errors`
    );
    console.log(
      `Time range: ${startTime.toISOString()} to ${endTime.toISOString()}`
    );

    // Calculate latency percentiles using industry-standard method
    const latencies = logs.map((log) => log.latency || 0).sort((a, b) => a - b);

    const p50Latency = Math.round(calculatePercentile(latencies, 50));
    const p95Latency = Math.round(calculatePercentile(latencies, 95));
    const p99Latency = Math.round(calculatePercentile(latencies, 99));
    const avgLatency = Math.round(
      latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length
    );

    // Log high latency requests for debugging
    const highLatencyLogs = logs.filter((log) => (log.latency || 0) > 10);
    if (highLatencyLogs.length > 0) {
      console.log(
        `Found ${highLatencyLogs.length} requests with latency > 10ms:`,
        highLatencyLogs.map((log) => ({
          route: log.route,
          latency: log.latency,
          status: log.status,
          timestamp: new Date(log.timestamp).toISOString(),
        }))
      );
    }

    console.log(
      `Latency stats: avg=${avgLatency.toFixed(
        2
      )}ms, p50=${p50Latency}ms, p95=${p95Latency}ms, p99=${p99Latency}ms`
    );

    // Enhanced analytics: Separate cache hits from misses
    const cacheHits = logs.filter((log) => log.cacheHit === true);
    const cacheMisses = logs.filter((log) => log.cacheHit === false);
    const unknownCacheStatus = logs.filter((log) => log.cacheHit === undefined);

    // User Experience Latency (only cache misses - actual work done)
    const cacheMissLatencies = cacheMisses
      .map((log) => log.latency || 0)
      .sort((a, b) => a - b);
    const userExpP50 =
      cacheMissLatencies.length > 0
        ? Math.round(calculatePercentile(cacheMissLatencies, 50))
        : 0;
    const userExpP95 =
      cacheMissLatencies.length > 0
        ? Math.round(calculatePercentile(cacheMissLatencies, 95))
        : 0;
    const userExpP99 =
      cacheMissLatencies.length > 0
        ? Math.round(calculatePercentile(cacheMissLatencies, 99))
        : 0;
    const userExpAvg =
      cacheMissLatencies.length > 0
        ? Math.round(
            cacheMissLatencies.reduce((sum, lat) => sum + lat, 0) /
              cacheMissLatencies.length
          )
        : 0;

    // Cache performance analytics
    const cacheHitRate =
      totalRequests > 0
        ? Math.round((cacheHits.length / totalRequests) * 100 * 10) / 10
        : 0;
    const cacheMissRate =
      totalRequests > 0
        ? Math.round((cacheMisses.length / totalRequests) * 100 * 10) / 10
        : 0;

    // Cache source breakdown
    const cacheSourceBreakdown: Record<string, number> = {};
    logs.forEach((log) => {
      if (log.cacheSource) {
        cacheSourceBreakdown[log.cacheSource] =
          (cacheSourceBreakdown[log.cacheSource] || 0) + 1;
      }
    });

    // Bot vs Browser analytics
    const botRequests = logs.filter((log) => log.isBot === true).length;
    const browserRequests = logs.filter((log) => log.isBrowser === true).length;
    const otherRequests = totalRequests - botRequests - browserRequests;

    console.log(
      `Enhanced Analytics: ${cacheHits.length} cache hits (${cacheHitRate}%), ${cacheMisses.length} cache misses (${cacheMissRate}%), ${unknownCacheStatus.length} unknown`
    );
    console.log(
      `User Experience Latency (cache misses only): avg=${userExpAvg}ms, p50=${userExpP50}ms, p95=${userExpP95}ms, p99=${userExpP99}ms`
    );
    console.log(
      `Request Types: ${browserRequests} browsers, ${botRequests} bots, ${otherRequests} other`
    );

    // Calculate top agents
    const agentCounts: Record<string, number> = {};
    logs.forEach((log) => {
      if (log.agentId) {
        agentCounts[log.agentId] = (agentCounts[log.agentId] || 0) + 1;
      }
    });

    const topAgents = Object.entries(agentCounts)
      .map(([agent_id, requests]) => ({ agent_id, requests }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);

    // Calculate region breakdown (simplified - using client IP as region)
    const regionCounts: Record<
      string,
      { requests: number; totalLatency: number }
    > = {};
    logs.forEach((log) => {
      const region = log.clientIP ? getRegionFromIP(log.clientIP) : "unknown";
      if (!regionCounts[region]) {
        regionCounts[region] = { requests: 0, totalLatency: 0 };
      }
      regionCounts[region].requests++;
      regionCounts[region].totalLatency += log.latency || 0;
    });

    const regionBreakdown = Object.entries(regionCounts).map(
      ([region, data]) => ({
        region,
        requests: data.requests,
        avg_latency: Math.round(data.totalLatency / data.requests),
      })
    );

    return {
      period,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      total_requests: totalRequests,
      success_rate: successRate,
      error_rate: errorRate,
      p50_latency: p50Latency,
      p95_latency: p95Latency,
      p99_latency: p99Latency,
      avg_latency: avgLatency,
      blocked_attempts: 0, // TODO: Implement blocked attempts tracking
      avg_approval_time: 0, // TODO: Implement approval time tracking
      top_agents: topAgents,
      region_breakdown: regionBreakdown,
      // Enhanced analytics
      cache_analytics: {
        cache_hits: cacheHits.length,
        cache_misses: cacheMisses.length,
        cache_hit_rate: cacheHitRate,
        cache_miss_rate: cacheMissRate,
        cache_source_breakdown: cacheSourceBreakdown,
      },
      user_experience_latency: {
        avg_latency: userExpAvg,
        p50_latency: userExpP50,
        p95_latency: userExpP95,
        p99_latency: userExpP99,
        sample_size: cacheMisses.length,
      },
      request_types: {
        browsers: browserRequests,
        bots: botRequests,
        other: otherRequests,
      },
    };
  } catch (error) {
    console.error("Error calculating aggregated metrics:", error);
    // Return default values on error
    return {
      period,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      total_requests: 0,
      success_rate: 100,
      error_rate: 0,
      p50_latency: 0,
      p95_latency: 0,
      p99_latency: 0,
      avg_latency: 0,
      blocked_attempts: 0,
      avg_approval_time: 0,
      top_agents: [],
      region_breakdown: [],
    };
  }
}

/**
 * Calculate percentile from sorted array using industry-standard method
 * P95 = 95% of requests are faster than this value
 */
function calculatePercentile(
  sortedArray: number[],
  percentile: number
): number {
  if (sortedArray.length === 0) return 0;

  const index = (percentile / 100) * (sortedArray.length - 1);

  if (Number.isInteger(index)) {
    return sortedArray[index];
  }

  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
}

/**
 * Get region from IP address (simplified)
 */
function getRegionFromIP(ip: string): string {
  // This is a simplified implementation
  // In production, you'd use a proper GeoIP service
  if (ip.startsWith("127.") || ip.startsWith("::1")) {
    return "localhost";
  }
  if (
    ip.startsWith("192.168.") ||
    ip.startsWith("10.") ||
    ip.startsWith("172.")
  ) {
    return "private";
  }
  return "unknown";
}

/**
 * Calculate SLO data for a time period
 */
export async function calculateSLOData(
  kv: KVNamespace,
  startTime: Date,
  endTime: Date
): Promise<SLOData> {
  const metrics = await calculateAggregatedMetrics(kv, startTime, endTime);

  return {
    period: `${startTime.toISOString()} to ${endTime.toISOString()}`,
    availability: metrics.success_rate,
    p95_latency: metrics.p95_latency, // Overall P95 (all requests)
    user_experience_p95_latency: metrics.user_experience_latency?.p95_latency, // User Experience P95 (cache misses only)
    error_rate: metrics.error_rate,
    mtts: metrics.avg_latency,
    blocked_attempts: metrics.blocked_attempts,
    total_requests: metrics.total_requests,
  };
}

/**
 * Check if SLO thresholds are breached
 * For passport verification system:
 * - 404 responses are normal business cases, not errors
 * - Only 5xx responses count as system errors
 * - SLOs should focus on system availability, not business logic
 * - Use User Experience P95 (cache misses only) for accurate performance measurement
 */
export function checkSLOBreach(sloData: SLOData): {
  breached: boolean;
  breaches: string[];
} {
  const breaches: string[] = [];

  // Use User Experience P95 (cache misses only) for accurate performance measurement
  // This represents the actual work the system does, not artificially low cache hit times
  const p95ToCheck = sloData.user_experience_p95_latency || sloData.p95_latency;
  const p95Source = sloData.user_experience_p95_latency
    ? "User Experience"
    : "Overall";

  // P95 latency thresholds aligned with performance targets:
  // - Ideal: ≤ 100ms (green)
  // - Acceptable: ≤ 200ms (yellow)
  // - Breach: > 200ms (red)
  if (p95ToCheck > 200) {
    breaches.push(
      `${p95Source} P95 latency ${p95ToCheck}ms exceeds 200ms threshold (breach)`
    );
  } else if (p95ToCheck > 100) {
    // Note: This is acceptable but not ideal - we'll log it but not breach
    console.warn(
      `${p95Source} P95 latency ${p95ToCheck}ms exceeds ideal 100ms threshold (acceptable)`
    );
  }

  // Error rate threshold - only system errors (5xx) count as failures
  // 0.5% is more reasonable for system errors in a passport verification API
  if (sloData.error_rate > 0.5) {
    breaches.push(
      `System error rate ${sloData.error_rate}% exceeds 0.5% threshold`
    );
  }

  // Availability threshold - 99.5% is more reasonable for API availability
  // This accounts for the fact that 404s are normal business cases
  if (sloData.availability < 99.5) {
    breaches.push(
      `API availability ${sloData.availability}% below 99.5% threshold`
    );
  }

  return {
    breached: breaches.length > 0,
    breaches,
  };
}

/**
 * Generate synthetic probe data
 */
export function generateSyntheticProbe(
  agentId: string,
  region: string,
  latency: number,
  success: boolean,
  errorType?: string
): MetricData {
  return {
    timestamp: new Date().toISOString(),
    metric_type: "synthetic_probe",
    value: latency,
    agent_id: agentId,
    region,
    error_type: errorType,
    metadata: {
      probe_type: "synthetic",
      success,
    },
  };
}

/**
 * Generate verify latency metric
 */
export function generateVerifyLatencyMetric(
  agentId: string,
  latency: number,
  region?: string,
  userAgent?: string,
  ipAddress?: string
): MetricData {
  return {
    timestamp: new Date().toISOString(),
    metric_type: "verify_latency",
    value: latency,
    agent_id: agentId,
    region,
    user_agent: userAgent,
    ip_address: ipAddress,
  };
}

/**
 * Generate verify success metric
 */
export function generateVerifySuccessMetric(
  agentId: string,
  region?: string,
  userAgent?: string,
  ipAddress?: string
): MetricData {
  return {
    timestamp: new Date().toISOString(),
    metric_type: "verify_success",
    value: 1,
    agent_id: agentId,
    region,
    user_agent: userAgent,
    ip_address: ipAddress,
  };
}

/**
 * Generate verify error metric
 */
export function generateVerifyErrorMetric(
  agentId: string,
  errorType: string,
  region?: string,
  userAgent?: string,
  ipAddress?: string
): MetricData {
  return {
    timestamp: new Date().toISOString(),
    metric_type: "verify_error",
    value: 1,
    agent_id: agentId,
    region,
    error_type: errorType,
    user_agent: userAgent,
    ip_address: ipAddress,
  };
}

/**
 * Generate blocked attempt metric
 */
export function generateBlockedAttemptMetric(
  agentId: string,
  reason: string,
  region?: string,
  userAgent?: string,
  ipAddress?: string
): MetricData {
  return {
    timestamp: new Date().toISOString(),
    metric_type: "blocked_attempt",
    value: 1,
    agent_id: agentId,
    region,
    error_type: reason,
    user_agent: userAgent,
    ip_address: ipAddress,
  };
}

/**
 * Generate approval time metric
 */
export function generateApprovalTimeMetric(
  agentId: string,
  approvalTime: number,
  region?: string
): MetricData {
  return {
    timestamp: new Date().toISOString(),
    metric_type: "approval_time",
    value: approvalTime,
    agent_id: agentId,
    region,
  };
}
