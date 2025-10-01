import { cors } from "../../utils/cors";
import { createLogger } from "../../utils/logger";
import {
  calculateAggregatedMetrics,
  calculateSLOData,
} from "../../utils/metrics";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";

interface Env {
  ai_passport_registry: KVNamespace;
  AP_VERSION: string;
}

export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const startTime = Date.now();
  const headers = cors(request);
  const logger = createLogger(env.ai_passport_registry);

  try {
    const url = new URL(request.url);
    const format = url.searchParams.get("format") || "csv";
    const period =
      (url.searchParams.get("period") as "hour" | "day" | "week" | "month") ||
      "week";
    const hours = parseInt(url.searchParams.get("hours") || "168"); // 7 days default

    if (format !== "csv") {
      const response = new Response(
        JSON.stringify({ error: "unsupported_format" }),
        {
          status: 400,
          headers: { "content-type": "application/json", ...headers },
        }
      );

      // Calculate time range
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

      await logger.logRequest(request, response, startTime.getTime());
      return response;
    }

    // Calculate time range
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

    // Get aggregated metrics
    const metrics = await calculateAggregatedMetrics(
      env.ai_passport_registry,
      startTime,
      endTime,
      period
    );

    // Get SLO data
    const sloData = await calculateSLOData(
      env.ai_passport_registry,
      startTime,
      endTime
    );

    // Generate CSV content
    const csvContent = generateMetricsCSV(metrics, sloData, startTime, endTime);

    const response = new Response(csvContent, {
      status: 200,
      headers: {
        "content-type": "text/csv",
        "content-disposition": `attachment; filename="agent-passport-metrics-${
          startTime.toISOString().split("T")[0]
        }-to-${endTime.toISOString().split("T")[0]}.csv"`,
        ...headers,
      },
    });

    await logger.logRequest(request, response, startTime.getTime());
    return response;
  } catch (error) {
    console.error("Error exporting metrics:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to export metrics",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json", ...headers },
      }
    );

    await logger.logRequest(request, response, Date.now());
    return response;
  }
};

/**
 * Generate CSV content for metrics export
 */
function generateMetricsCSV(
  metrics: any,
  sloData: any,
  startTime: Date,
  endTime: Date
): string {
  const rows = [
    // Header
    [
      "Metric",
      "Value",
      "Unit",
      "Period",
      "Start Time",
      "End Time",
      "Generated At",
    ],

    // Basic metrics
    [
      "Total Requests",
      metrics.total_requests.toString(),
      "count",
      metrics.period,
      startTime.toISOString(),
      endTime.toISOString(),
      new Date().toISOString(),
    ],
    [
      "Success Rate",
      metrics.success_rate.toString(),
      "percentage",
      metrics.period,
      startTime.toISOString(),
      endTime.toISOString(),
      new Date().toISOString(),
    ],
    [
      "Error Rate",
      metrics.error_rate.toString(),
      "percentage",
      metrics.period,
      startTime.toISOString(),
      endTime.toISOString(),
      new Date().toISOString(),
    ],
    [
      "P50 Latency",
      metrics.p50_latency.toString(),
      "milliseconds",
      metrics.period,
      startTime.toISOString(),
      endTime.toISOString(),
      new Date().toISOString(),
    ],
    [
      "P95 Latency",
      metrics.p95_latency.toString(),
      "milliseconds",
      metrics.period,
      startTime.toISOString(),
      endTime.toISOString(),
      new Date().toISOString(),
    ],
    [
      "P99 Latency",
      metrics.p99_latency.toString(),
      "milliseconds",
      metrics.period,
      startTime.toISOString(),
      endTime.toISOString(),
      new Date().toISOString(),
    ],
    [
      "Average Latency",
      metrics.avg_latency.toString(),
      "milliseconds",
      metrics.period,
      startTime.toISOString(),
      endTime.toISOString(),
      new Date().toISOString(),
    ],
    [
      "Blocked Attempts",
      metrics.blocked_attempts.toString(),
      "count",
      metrics.period,
      startTime.toISOString(),
      endTime.toISOString(),
      new Date().toISOString(),
    ],
    [
      "Average Approval Time",
      metrics.avg_approval_time?.toString() || "N/A",
      "milliseconds",
      metrics.period,
      startTime.toISOString(),
      endTime.toISOString(),
      new Date().toISOString(),
    ],

    // SLO data
    [
      "SLO - Availability",
      sloData.availability.toString(),
      "percentage",
      sloData.period,
      startTime.toISOString(),
      endTime.toISOString(),
      new Date().toISOString(),
    ],
    [
      "SLO - P95 Latency",
      sloData.p95_latency.toString(),
      "milliseconds",
      sloData.period,
      startTime.toISOString(),
      endTime.toISOString(),
      new Date().toISOString(),
    ],
    [
      "SLO - Error Rate",
      sloData.error_rate.toString(),
      "percentage",
      sloData.period,
      startTime.toISOString(),
      endTime.toISOString(),
      new Date().toISOString(),
    ],
    [
      "SLO - MTTS",
      sloData.mtts.toString(),
      "milliseconds",
      sloData.period,
      startTime.toISOString(),
      endTime.toISOString(),
      new Date().toISOString(),
    ],
    [
      "SLO - Blocked Attempts",
      sloData.blocked_attempts.toString(),
      "count",
      sloData.period,
      startTime.toISOString(),
      endTime.toISOString(),
      new Date().toISOString(),
    ],
    [
      "SLO - Total Requests",
      sloData.total_requests.toString(),
      "count",
      sloData.period,
      startTime.toISOString(),
      endTime.toISOString(),
      new Date().toISOString(),
    ],
  ];

  // Add top agents
  if (metrics.top_agents && metrics.top_agents.length > 0) {
    rows.push(["", "", "", "", "", "", ""]); // Empty row
    rows.push([
      "Top Agents",
      "Requests",
      "count",
      metrics.period,
      startTime.toISOString(),
      endTime.toISOString(),
      new Date().toISOString(),
    ]);
    metrics.top_agents.forEach((agent: any) => {
      rows.push([
        agent.agent_id,
        agent.requests.toString(),
        "count",
        metrics.period,
        startTime.toISOString(),
        endTime.toISOString(),
        new Date().toISOString(),
      ]);
    });
  }

  // Add region breakdown
  if (metrics.region_breakdown && metrics.region_breakdown.length > 0) {
    rows.push(["", "", "", "", "", "", ""]); // Empty row
    rows.push([
      "Region",
      "Requests",
      "count",
      metrics.period,
      startTime.toISOString(),
      endTime.toISOString(),
      new Date().toISOString(),
    ]);
    rows.push([
      "Region",
      "Avg Latency",
      "milliseconds",
      metrics.period,
      startTime.toISOString(),
      endTime.toISOString(),
      new Date().toISOString(),
    ]);
    metrics.region_breakdown.forEach((region: any) => {
      rows.push([
        region.region,
        region.requests.toString(),
        "count",
        metrics.period,
        startTime.toISOString(),
        endTime.toISOString(),
        new Date().toISOString(),
      ]);
      rows.push([
        region.region,
        region.avg_latency.toString(),
        "milliseconds",
        metrics.period,
        startTime.toISOString(),
        endTime.toISOString(),
        new Date().toISOString(),
      ]);
    });
  }

  // Convert to CSV
  return rows
    .map((row) =>
      row
        .map((cell) =>
          typeof cell === "string" && cell.includes(",")
            ? `"${cell.replace(/"/g, '""')}"`
            : cell
        )
        .join(",")
    )
    .join("\n");
}
