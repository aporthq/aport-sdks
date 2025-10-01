import { KVNamespace } from "@cloudflare/workers-types";

export interface RateLimitConfig {
  requestsPerMinute: number;
  windowMs: number;
  keyPrefix: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
  metrics?: {
    totalRequests: number;
    windowStart: number;
    windowEnd: number;
  };
}

/**
 * Rate limiting utility using Cloudflare KV storage
 * Implements sliding window rate limiting
 */
export class RateLimiter {
  private kv: KVNamespace;
  private config: RateLimitConfig;

  constructor(kv: KVNamespace, config: RateLimitConfig) {
    this.kv = kv;
    this.config = config;
  }

  /**
   * Check if request should be allowed based on rate limit
   * @param identifier - Unique identifier (e.g., IP address)
   * @returns Rate limit result
   */
  async checkLimit(identifier: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const key = `${this.config.keyPrefix}:${identifier}`;

    try {
      // Get existing requests from KV
      const existing = (await this.kv.get(key, "json")) as number[] | null;
      const requests = existing || [];

      // Filter out requests outside the current window
      const validRequests = requests.filter(
        (timestamp) => timestamp > windowStart
      );

      // Check if we're under the limit
      if (validRequests.length >= this.config.requestsPerMinute) {
        // Calculate retry after time (oldest request + window - now)
        const oldestRequest = Math.min(...validRequests);
        const retryAfter = Math.ceil(
          (oldestRequest + this.config.windowMs - now) / 1000
        );

        return {
          allowed: false,
          remaining: 0,
          resetTime: oldestRequest + this.config.windowMs,
          retryAfter: Math.max(0, retryAfter),
          metrics: {
            totalRequests: validRequests.length,
            windowStart: windowStart,
            windowEnd: now,
          },
        };
      }

      // Add current request
      validRequests.push(now);

      // Store updated requests (with TTL)
      await this.kv.put(key, JSON.stringify(validRequests), {
        expirationTtl: Math.ceil(this.config.windowMs / 1000),
      });

      return {
        allowed: true,
        remaining: this.config.requestsPerMinute - validRequests.length,
        resetTime: now + this.config.windowMs,
        metrics: {
          totalRequests: validRequests.length,
          windowStart: windowStart,
          windowEnd: now,
        },
      };
    } catch (error) {
      console.error("Rate limiting error:", error);
      // Fail open - allow request if rate limiting fails
      return {
        allowed: true,
        remaining: this.config.requestsPerMinute,
        resetTime: now + this.config.windowMs,
        metrics: {
          totalRequests: 0,
          windowStart: now - this.config.windowMs,
          windowEnd: now,
        },
      };
    }
  }

  /**
   * Get client IP address from request
   * @param request - The request object
   * @returns IP address string
   */
  static getClientIP(request: Request): string {
    // Check various headers for client IP
    const cfConnectingIP = request.headers.get("cf-connecting-ip");
    const xForwardedFor = request.headers.get("x-forwarded-for");
    const xRealIP = request.headers.get("x-real-ip");

    if (cfConnectingIP) {
      return cfConnectingIP;
    }

    if (xForwardedFor) {
      // X-Forwarded-For can contain multiple IPs, take the first one
      return xForwardedFor.split(",")[0].trim();
    }

    if (xRealIP) {
      return xRealIP;
    }

    // Fallback to a default identifier
    return "unknown";
  }
}

/**
 * Create rate limiter for verify endpoints
 * @param kv - KV namespace
 * @param requestsPerMinute - Number of requests allowed per minute
 * @returns RateLimiter instance
 */
export function createVerifyRateLimiter(
  kv: KVNamespace,
  requestsPerMinute: number = 60
): RateLimiter {
  return new RateLimiter(kv, {
    requestsPerMinute,
    windowMs: 60 * 1000, // 1 minute window
    keyPrefix: "rate_limit:verify",
  });
}

/**
 * Create rate limiter for admin endpoints
 * @param kv - KV namespace
 * @param requestsPerMinute - Number of requests allowed per minute
 * @returns RateLimiter instance
 */
export function createAdminRateLimiter(
  kv: KVNamespace,
  requestsPerMinute: number = 100
): RateLimiter {
  return new RateLimiter(kv, {
    requestsPerMinute,
    windowMs: 60 * 1000, // 1 minute window
    keyPrefix: "rate_limit:admin",
  });
}

/**
 * Create rate limiter for org endpoints
 * @param kv - KV namespace
 * @param requestsPerMinute - Number of requests allowed per minute
 * @returns RateLimiter instance
 */
export function createOrgRateLimiter(
  kv: KVNamespace,
  requestsPerMinute: number = 30
): RateLimiter {
  return new RateLimiter(kv, {
    requestsPerMinute,
    windowMs: 60 * 1000, // 1 minute window
    keyPrefix: "rate_limit:org",
  });
}

/**
 * Generic rate limiter factory
 * @param kv - KV namespace
 * @param requestsPerMinute - Number of requests allowed per minute
 * @param type - Rate limit type (verify, admin, org)
 * @returns RateLimiter instance
 */
export function createRateLimiter(
  kv: KVNamespace,
  requestsPerMinute: number,
  type: "verify" | "admin" | "org" = "verify"
): RateLimiter {
  const keyPrefix = `rate_limit:${type}`;
  return new RateLimiter(kv, {
    requestsPerMinute,
    windowMs: 60 * 1000, // 1 minute window
    keyPrefix,
  });
}

/**
 * Rate limit metrics collection utility
 */
export class RateLimitMetrics {
  private kv: KVNamespace;

  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  /**
   * Record rate limit hit for monitoring
   */
  async recordRateLimitHit(
    type: "verify" | "admin" | "org",
    identifier: string,
    allowed: boolean,
    remaining: number,
    totalRequests: number
  ): Promise<void> {
    try {
      const timestamp = Date.now();
      const key = `metrics:rate_limit:${type}:${Math.floor(timestamp / 60000)}`; // 1-minute buckets

      const existing = ((await this.kv.get(key, "json")) as any[]) || [];
      existing.push({
        timestamp,
        identifier,
        allowed,
        remaining,
        totalRequests,
        type,
      });

      // Keep only last 100 entries per minute to prevent bloat
      const trimmed = existing.slice(-100);

      await this.kv.put(key, JSON.stringify(trimmed), {
        expirationTtl: 3600, // 1 hour TTL
      });
    } catch (error) {
      console.error("Failed to record rate limit metrics:", error);
      // Don't throw - metrics collection should not break the main flow
    }
  }

  /**
   * Get rate limit statistics for a time period
   */
  async getRateLimitStats(
    type: "verify" | "admin" | "org",
    minutes: number = 60
  ): Promise<{
    totalRequests: number;
    rateLimitedRequests: number;
    averageUtilization: number;
    topIdentifiers: Array<{ identifier: string; requests: number }>;
  }> {
    try {
      const now = Date.now();
      const stats = {
        totalRequests: 0,
        rateLimitedRequests: 0,
        averageUtilization: 0,
        topIdentifiers: [] as Array<{ identifier: string; requests: number }>,
      };

      const identifierCounts = new Map<string, number>();

      // Collect data from last N minutes
      for (let i = 0; i < minutes; i++) {
        const minuteKey = `metrics:rate_limit:${type}:${Math.floor(
          (now - i * 60000) / 60000
        )}`;
        const data = ((await this.kv.get(minuteKey, "json")) as any[]) || [];

        for (const entry of data) {
          stats.totalRequests++;
          if (!entry.allowed) {
            stats.rateLimitedRequests++;
          }

          const count = identifierCounts.get(entry.identifier) || 0;
          identifierCounts.set(entry.identifier, count + 1);
        }
      }

      // Calculate top identifiers
      stats.topIdentifiers = Array.from(identifierCounts.entries())
        .map(([identifier, requests]) => ({ identifier, requests }))
        .sort((a, b) => b.requests - a.requests)
        .slice(0, 10);

      // Calculate average utilization (simplified)
      stats.averageUtilization =
        stats.totalRequests > 0
          ? (stats.totalRequests / minutes / 60) * 100 // requests per second as percentage
          : 0;

      return stats;
    } catch (error) {
      console.error("Failed to get rate limit stats:", error);
      return {
        totalRequests: 0,
        rateLimitedRequests: 0,
        averageUtilization: 0,
        topIdentifiers: [],
      };
    }
  }
}
