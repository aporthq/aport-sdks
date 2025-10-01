/**
 * Performance Monitoring Utilities
 * Tracks cache performance and latency metrics
 */

export interface PerformanceMetrics {
  timestamp: number;
  endpoint: string;
  agentId: string;
  cacheSource: "l1" | "l2" | "l3";
  latency: number;
  totalLatency: number;
  cacheHit: boolean;
  memoryUsage?: number;
}

export interface PerformanceStats {
  totalRequests: number;
  avgLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  cacheHitRate: number;
  l1HitRate: number;
  l2HitRate: number;
  l3HitRate: number;
  errorRate: number;
}

/**
 * Performance monitor for cache operations
 */
export class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private maxMetrics = 1000; // Keep last 1000 measurements
  private errors = 0;

  /**
   * Record a performance metric
   */
  record(metric: Omit<PerformanceMetrics, "timestamp">): void {
    const fullMetric: PerformanceMetrics = {
      ...metric,
      timestamp: Date.now(),
    };

    this.metrics.push(fullMetric);

    // Keep only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }
  }

  /**
   * Record an error
   */
  recordError(): void {
    this.errors++;
  }

  /**
   * Get performance statistics
   */
  getStats(): PerformanceStats {
    if (this.metrics.length === 0) {
      return {
        totalRequests: 0,
        avgLatency: 0,
        p50Latency: 0,
        p95Latency: 0,
        p99Latency: 0,
        cacheHitRate: 0,
        l1HitRate: 0,
        l2HitRate: 0,
        l3HitRate: 0,
        errorRate: 0,
      };
    }

    const latencies = this.metrics.map((m) => m.latency).sort((a, b) => a - b);
    const totalRequests = this.metrics.length + this.errors;
    const cacheHits = this.metrics.filter((m) => m.cacheHit).length;
    const l1Hits = this.metrics.filter((m) => m.cacheSource === "l1").length;
    const l2Hits = this.metrics.filter((m) => m.cacheSource === "l2").length;
    const l3Hits = this.metrics.filter((m) => m.cacheSource === "l3").length;

    return {
      totalRequests,
      avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      p50Latency: this.percentile(latencies, 0.5),
      p95Latency: this.percentile(latencies, 0.95),
      p99Latency: this.percentile(latencies, 0.99),
      cacheHitRate: cacheHits / this.metrics.length,
      l1HitRate: l1Hits / this.metrics.length,
      l2HitRate: l2Hits / this.metrics.length,
      l3HitRate: l3Hits / this.metrics.length,
      errorRate: this.errors / totalRequests,
    };
  }

  /**
   * Get recent metrics (last N)
   */
  getRecentMetrics(count: number = 100): PerformanceMetrics[] {
    return this.metrics.slice(-count);
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
    this.errors = 0;
  }

  /**
   * Calculate percentile
   */
  private percentile(sortedArray: number[], p: number): number {
    const index = Math.ceil(sortedArray.length * p) - 1;
    return sortedArray[Math.max(0, index)];
  }
}

// Global performance monitor
const performanceMonitor = new PerformanceMonitor();

/**
 * Record verify endpoint performance
 */
export function recordVerifyPerformance(
  agentId: string,
  cacheSource: "l1" | "l2" | "l3",
  latency: number,
  totalLatency: number,
  cacheHit: boolean
): void {
  performanceMonitor.record({
    endpoint: "verify",
    agentId,
    cacheSource,
    latency,
    totalLatency,
    cacheHit,
  });
}

/**
 * Record verify endpoint error
 */
export function recordVerifyError(): void {
  performanceMonitor.recordError();
}

/**
 * Get performance statistics
 */
export function getPerformanceStats(): PerformanceStats {
  return performanceMonitor.getStats();
}

/**
 * Get recent performance metrics
 */
export function getRecentMetrics(count?: number): PerformanceMetrics[] {
  return performanceMonitor.getRecentMetrics(count);
}

/**
 * Clear performance metrics
 */
export function clearPerformanceMetrics(): void {
  performanceMonitor.clear();
}
