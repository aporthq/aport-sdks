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
export declare class Logger {
    private kv;
    private metricsKey;
    constructor(kv: KVNamespace);
    /**
     * Log a request with timing information
     * @param request - The request object
     * @param response - The response object
     * @param startTime - Request start time
     * @param additionalData - Additional data to log
     */
    logRequest(request: Request, response: Response, startTime: number, additionalData?: Partial<RequestLog>): Promise<void>;
    /**
     * Log an error
     * @param request - The request object
     * @param error - The error object
     * @param additionalData - Additional data to log
     */
    logError(request: Request, error: Error, additionalData?: Partial<RequestLog>): Promise<void>;
    /**
     * Get current metrics
     * @param timeWindow - Time window in milliseconds (default: 24 hours)
     * @returns Metrics data
     */
    getMetrics(timeWindow?: number): Promise<MetricsData>;
    /**
     * Get client IP address from request
     * @param request - The request object
     * @returns IP address string
     */
    private getClientIP;
    /**
     * Store log entry in KV
     * @param logEntry - The log entry to store
     */
    private storeLogEntry;
    /**
     * Calculate percentile from sorted array
     * @param sortedArray - Sorted array of numbers
     * @param percentile - Percentile to calculate (0-1)
     * @returns Percentile value
     */
    private calculatePercentile;
    /**
     * Log an audit event
     * @param auditData - The audit event data
     */
    logAudit(auditData: Record<string, any>): Promise<void>;
}
/**
 * Create logger instance
 * @param kv - KV namespace
 * @returns Logger instance
 */
export declare function createLogger(kv: KVNamespace): Logger;
//# sourceMappingURL=logger.d.ts.map