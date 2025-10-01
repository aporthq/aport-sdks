/**
 * Efficient Performance Logger
 * Collects timing data during request processing and logs once at the end
 */

export interface PerformanceEntry {
  stage: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  details?: any;
}

export class PerformanceLogger {
  private entries: PerformanceEntry[] = [];
  private startTime: number;
  private agentId: string;

  constructor(agentId: string) {
    this.agentId = agentId;
    this.startTime = Date.now();
  }

  /**
   * Start timing a stage
   */
  start(stage: string, details?: any): void {
    this.entries.push({
      stage,
      startTime: Date.now(),
      details,
    });
  }

  /**
   * End timing a stage
   */
  end(stage: string, details?: any): void {
    const entry = this.entries.find((e) => e.stage === stage && !e.endTime);
    if (entry) {
      entry.endTime = Date.now();
      entry.duration = entry.endTime - entry.startTime;
      if (details) {
        entry.details = { ...entry.details, ...details };
      }
    }
  }

  /**
   * Log a single timing event
   */
  log(stage: string, duration: number, details?: any): void {
    this.entries.push({
      stage,
      startTime: Date.now() - duration,
      endTime: Date.now(),
      duration,
      details,
    });
  }

  /**
   * Log all collected performance data once at the end
   */
  logSummary(): void {
    const totalDuration = Date.now() - this.startTime;

    // Create a summary log entry
    const summary = {
      agentId: this.agentId,
      totalDuration,
      stages: this.entries.map((entry) => ({
        stage: entry.stage,
        duration: entry.duration || 0,
        details: entry.details,
      })),
      breakdown: this.entries.reduce((acc, entry) => {
        acc[entry.stage] = entry.duration || 0;
        return acc;
      }, {} as Record<string, number>),
    };

    console.log(
      `[VERIFY-PERF] SUMMARY | Agent: ${
        this.agentId
      } | Total: ${totalDuration}ms | Breakdown: ${JSON.stringify(
        summary.breakdown
      )}`
    );

    // Log individual stages for detailed analysis
    this.entries.forEach((entry) => {
      if (entry.duration !== undefined) {
        console.log(
          `[VERIFY-PERF] ${entry.stage} | Agent: ${this.agentId} | Duration: ${
            entry.duration
          }ms${
            entry.details ? ` | Details: ${JSON.stringify(entry.details)}` : ""
          }`
        );
      }
    });
  }

  /**
   * Get performance summary for metrics
   */
  getSummary() {
    const totalDuration = Date.now() - this.startTime;
    return {
      agentId: this.agentId,
      totalDuration,
      stages: this.entries.map((entry) => ({
        stage: entry.stage,
        duration: entry.duration || 0,
        details: entry.details,
      })),
      breakdown: this.entries.reduce((acc, entry) => {
        acc[entry.stage] = entry.duration || 0;
        return acc;
      }, {} as Record<string, number>),
    };
  }
}

/**
 * Create a performance logger instance
 */
export function createPerformanceLogger(agentId: string): PerformanceLogger {
  return new PerformanceLogger(agentId);
}
