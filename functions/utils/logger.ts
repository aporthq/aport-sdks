import { KVNamespace } from "@cloudflare/workers-types";

export interface RequestLog {
  timestamp: number;
  route: string;
  method: string;
  status: number;
  latency: number;
  clientIP: string;
  userAgent?: string;
  agentId?: string;
  error?: string;
  packId?: string;
  // Enhanced analytics metadata
  cacheHit?: boolean;
  cacheSource?: "l1" | "l2" | "l3" | "edge" | "none";
  cacheLatency?: number;
  region?: string;
  cfRay?: string;
  isBot?: boolean;
  isBrowser?: boolean;
  decisionsVerified?: number;
  decisionsInvalid?: number;
}

export interface MetricsData {
  totalRequests: number;
  errorRate: number;
  p95Latency: number;
  p99Latency: number;
  averageLatency: number;
  statusCounts: Record<number, number>;
  routeCounts: Record<string, number>;
}

/**
 * Logger utility for request tracking and metrics
 */
export class Logger {
  private kv: KVNamespace;
  private metricsKey = "metrics:requests";

  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  /**
   * Log a request with timing information
   * @param request - The request object
   * @param response - The response object
   * @param startTime - Request start time
   * @param additionalData - Additional data to log
   */
  async logRequest(
    request: Request,
    response: Response,
    startTime: number,
    additionalData: Partial<RequestLog> = {}
  ): Promise<void> {
    const endTime = Date.now();
    const latency = endTime - startTime;
    const url = new URL(request.url);
    const route = url.pathname;

    // Only log relevant endpoints for analytics
    const relevantEndpoints = [
      "/api/verify",
      "/api/verify-compact",
      "/api/claim/",
      "/api/admin/",
      "/api/about/",
    ];

    const isRelevantEndpoint = relevantEndpoints.some((endpoint) =>
      route.startsWith(endpoint)
    );

    if (!isRelevantEndpoint) {
      console.log(`Skipping log for non-analytics endpoint: ${route}`);
      return;
    }

    const logEntry: RequestLog = {
      timestamp: endTime,
      route,
      method: request.method,
      status: response.status,
      latency,
      clientIP: this.getClientIP(request),
      userAgent: request.headers.get("user-agent") || undefined,
      ...additionalData,
    };

    // Log to console for immediate visibility
    console.log(
      JSON.stringify({
        type: "request_log",
        ...logEntry,
      })
    );

    // Log high latency requests for debugging
    if (latency > 10) {
      console.log(`HIGH LATENCY: ${route} took ${latency}ms`, {
        method: request.method,
        status: response.status,
        clientIP: this.getClientIP(request),
        userAgent: request.headers.get("user-agent"),
        timestamp: new Date().toISOString(),
      });
    }

    // Store in KV for metrics calculation
    try {
      await this.storeLogEntry(logEntry);
    } catch (error) {
      console.error("Failed to store log entry:", error);
    }
  }

  /**
   * Log an error
   * @param request - The request object
   * @param error - The error object
   * @param additionalData - Additional data to log
   */
  async logError(
    request: Request,
    error: Error,
    additionalData: Partial<RequestLog> = {}
  ): Promise<void> {
    const url = new URL(request.url);
    const route = url.pathname;

    // Only log errors for relevant endpoints
    const relevantEndpoints = [
      "/api/verify",
      "/api/verify-compact",
      "/api/claim/",
      "/api/admin/",
      "/api/about/",
    ];

    const isRelevantEndpoint = relevantEndpoints.some((endpoint) =>
      route.startsWith(endpoint)
    );

    if (!isRelevantEndpoint) {
      console.log(`Skipping error log for non-analytics endpoint: ${route}`);
      return;
    }

    const logEntry: RequestLog = {
      timestamp: Date.now(),
      route,
      method: request.method,
      status: 500,
      latency: 0,
      clientIP: this.getClientIP(request),
      userAgent: request.headers.get("user-agent") || undefined,
      error: error.message,
      ...additionalData,
    };

    console.error(
      JSON.stringify({
        type: "error_log",
        ...logEntry,
      })
    );

    try {
      await this.storeLogEntry(logEntry);
    } catch (storeError) {
      console.error("Failed to store error log entry:", storeError);
    }
  }

  /**
   * Get current metrics
   * @param timeWindow - Time window in milliseconds (default: 24 hours)
   * @returns Metrics data
   */
  async getMetrics(
    timeWindow: number = 24 * 60 * 60 * 1000
  ): Promise<MetricsData> {
    try {
      const cutoffTime = Date.now() - timeWindow;
      const { keys } = await this.kv.list({ prefix: "log:" });

      const recentLogs: RequestLog[] = [];

      // Get recent log entries
      for (const key of keys) {
        const logEntry = (await this.kv.get(key.name, "json")) as RequestLog;
        if (logEntry && logEntry.timestamp > cutoffTime) {
          recentLogs.push(logEntry);
        }
      }

      if (recentLogs.length === 0) {
        return {
          totalRequests: 0,
          errorRate: 0,
          p95Latency: 0,
          p99Latency: 0,
          averageLatency: 0,
          statusCounts: {},
          routeCounts: {},
        };
      }

      // Calculate metrics
      const latencies = recentLogs
        .map((log) => log.latency)
        .sort((a, b) => a - b);
      const errorCount = recentLogs.filter((log) => log.status >= 500).length;
      const totalRequests = recentLogs.length;

      const statusCounts: Record<number, number> = {};
      const routeCounts: Record<string, number> = {};

      recentLogs.forEach((log) => {
        statusCounts[log.status] = (statusCounts[log.status] || 0) + 1;
        routeCounts[log.route] = (routeCounts[log.route] || 0) + 1;
      });

      return {
        totalRequests,
        errorRate: (errorCount / totalRequests) * 100,
        p95Latency: this.calculatePercentile(latencies, 0.95),
        p99Latency: this.calculatePercentile(latencies, 0.99),
        averageLatency:
          latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length,
        statusCounts,
        routeCounts,
      };
    } catch (error) {
      console.error("Failed to get metrics:", error);
      return {
        totalRequests: 0,
        errorRate: 0,
        p95Latency: 0,
        p99Latency: 0,
        averageLatency: 0,
        statusCounts: {},
        routeCounts: {},
      };
    }
  }

  /**
   * Get client IP address from request
   * @param request - The request object
   * @returns IP address string
   */
  private getClientIP(request: Request): string {
    const cfConnectingIP = request.headers.get("cf-connecting-ip");
    const xForwardedFor = request.headers.get("x-forwarded-for");
    const xRealIP = request.headers.get("x-real-ip");

    if (cfConnectingIP) {
      return cfConnectingIP;
    }

    if (xForwardedFor) {
      return xForwardedFor.split(",")[0].trim();
    }

    if (xRealIP) {
      return xRealIP;
    }

    return "unknown";
  }

  /**
   * Store log entry in KV
   * @param logEntry - The log entry to store
   */
  private async storeLogEntry(logEntry: RequestLog): Promise<void> {
    const key = `log:${logEntry.timestamp}:${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    console.log(
      `Storing log entry with key: ${key}, latency: ${logEntry.latency}`
    );
    try {
      await this.kv.put(key, JSON.stringify(logEntry), {
        expirationTtl: 7 * 24 * 60 * 60, // 7 days
      });
      console.log(`Successfully stored log entry: ${key}`);
    } catch (error) {
      console.error(`Failed to store log entry ${key}:`, error);
    }
  }

  /**
   * Calculate percentile from sorted array
   * @param sortedArray - Sorted array of numbers
   * @param percentile - Percentile to calculate (0-1)
   * @returns Percentile value
   */
  private calculatePercentile(
    sortedArray: number[],
    percentile: number
  ): number {
    if (sortedArray.length === 0) return 0;

    const index = Math.ceil(sortedArray.length * percentile) - 1;
    return sortedArray[Math.max(0, index)];
  }

  /**
   * Log an audit event
   * @param auditData - The audit event data
   */
  async logAudit(auditData: Record<string, any>): Promise<void> {
    const auditLog = {
      timestamp: Date.now(),
      ...auditData,
    };

    try {
      await this.kv.put(`audit:${Date.now()}`, JSON.stringify(auditLog), {
        expirationTtl: 2592000, // 30 days
      });
    } catch (logError) {
      console.error("Failed to log audit event:", logError);
    }
  }
}

/**
 * Create logger instance
 * @param kv - KV namespace
 * @returns Logger instance
 */
export function createLogger(kv: KVNamespace): Logger {
  return new Logger(kv);
}
