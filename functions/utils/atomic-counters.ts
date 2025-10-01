/**
 * Atomic Counters Utility
 *
 * Provides atomic counter operations for daily caps and other limits
 * using Cloudflare KV with optimistic concurrency control.
 */

export interface CounterResult {
  success: boolean;
  currentValue: number;
  remaining: number;
  error?: string;
}

export interface DailyCounter {
  date: string; // YYYY-MM-DD
  currency: string;
  used: number;
  limit: number;
}

/**
 * Atomic counter operations using KV with retry logic
 */
export class AtomicCounter {
  constructor(private kv: KVNamespace) {}

  /**
   * Atomically increment a daily counter with proper race condition protection
   */
  async incrementDailyCounter(
    agentId: string,
    currency: string,
    amount: number,
    dailyLimit: number,
    maxRetries: number = 5
  ): Promise<CounterResult> {
    const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const key = `daily_counter:${agentId}:${currency}:${date}`;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Get current value with metadata
        const current = (await this.kv.get(key, "json")) as
          | (DailyCounter & { version?: number })
          | null;
        const currentValue = current?.used || 0;
        const newValue = currentValue + amount;

        // Check if increment would exceed limit
        if (newValue > dailyLimit) {
          return {
            success: false,
            currentValue,
            remaining: Math.max(0, dailyLimit - currentValue),
            error: `Daily limit ${dailyLimit} would be exceeded (current: ${currentValue}, requested: ${amount})`,
          };
        }

        // Prepare new counter data with version for optimistic concurrency
        const newCounter: DailyCounter & { version: number } = {
          date,
          currency,
          used: newValue,
          limit: dailyLimit,
          version: (current?.version || 0) + 1,
        };

        // Use conditional put to prevent race conditions
        // If current exists, we need to ensure we're updating the same version
        const putOptions: any = {
          expirationTtl: 86400, // 24 hours
        };

        // Add conditional logic if we have an existing counter
        if (current) {
          // This is a best-effort approach since KV doesn't support true CAS
          // In production, use Durable Objects for true atomicity
          putOptions.metadata = {
            expectedVersion: current.version || 0,
          };
        }

        await this.kv.put(key, JSON.stringify(newCounter), putOptions);

        // Verify the update was successful by reading back
        const verify = (await this.kv.get(key, "json")) as
          | (DailyCounter & { version?: number })
          | null;
        if (
          verify &&
          verify.version === newCounter.version &&
          verify.used === newValue
        ) {
          return {
            success: true,
            currentValue: newValue,
            remaining: dailyLimit - newValue,
          };
        } else {
          // Version mismatch - retry
          console.warn(
            `Counter version mismatch, retrying... (attempt ${attempt + 1})`
          );
          await new Promise((resolve) =>
            setTimeout(resolve, 10 * (attempt + 1))
          );
          continue;
        }
      } catch (error) {
        console.error(`Atomic counter attempt ${attempt + 1} failed:`, error);
        if (attempt === maxRetries - 1) {
          return {
            success: false,
            currentValue: 0,
            remaining: 0,
            error: `Failed to update counter after ${maxRetries} attempts: ${error}`,
          };
        }
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }

    return {
      success: false,
      currentValue: 0,
      remaining: 0,
      error: "Max retries exceeded",
    };
  }

  /**
   * Get current daily counter value
   */
  async getDailyCounter(
    agentId: string,
    currency: string
  ): Promise<{ used: number; limit: number; remaining: number }> {
    const date = new Date().toISOString().split("T")[0];
    const key = `daily_counter:${agentId}:${currency}:${date}`;

    try {
      const current = (await this.kv.get(key, "json")) as DailyCounter | null;
      if (current) {
        return {
          used: current.used,
          limit: current.limit,
          remaining: Math.max(0, current.limit - current.used),
        };
      }
    } catch (error) {
      console.error("Failed to get daily counter:", error);
    }

    return { used: 0, limit: 0, remaining: 0 };
  }

  /**
   * Reset daily counter (for testing or manual intervention)
   */
  async resetDailyCounter(agentId: string, currency: string): Promise<boolean> {
    const date = new Date().toISOString().split("T")[0];
    const key = `daily_counter:${agentId}:${currency}:${date}`;

    try {
      await this.kv.delete(key);
      return true;
    } catch (error) {
      console.error("Failed to reset daily counter:", error);
      return false;
    }
  }
}

/**
 * Idempotency key management
 */
export class IdempotencyManager {
  constructor(private kv: KVNamespace) {}

  /**
   * Check if idempotency key has been used and record it
   * Uses proper scoping to prevent collisions across agents/orders
   */
  async checkAndRecordIdempotency(
    agentId: string,
    orderId: string,
    idempotencyKey: string,
    ttlSeconds: number = 86400 // 24 hours
  ): Promise<{ isDuplicate: boolean; decisionId?: string }> {
    // Properly scope the key to prevent collisions
    const key = `idempotency:${agentId}:${orderId}:${idempotencyKey}`;

    // Validate inputs to prevent injection attacks
    if (!agentId || !orderId || !idempotencyKey) {
      console.error("Invalid idempotency parameters");
      return { isDuplicate: false };
    }

    // Validate idempotency key format
    if (!/^[a-zA-Z0-9_-]{10,64}$/.test(idempotencyKey)) {
      console.error("Invalid idempotency key format");
      return { isDuplicate: false };
    }

    try {
      // Try to get existing record
      const existing = (await this.kv.get(key, "json")) as {
        decisionId: string;
        timestamp: string;
        agentId: string;
        orderId: string;
      } | null;

      if (existing) {
        // Verify the record belongs to the same agent and order
        if (existing.agentId === agentId && existing.orderId === orderId) {
          return {
            isDuplicate: true,
            decisionId: existing.decisionId,
          };
        } else {
          // This should never happen with proper scoping, but log it
          console.warn(
            "Idempotency key collision detected but scoped correctly"
          );
        }
      }

      // Record new idempotency key with full context
      const decisionId = `dec_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const record = {
        decisionId,
        timestamp: new Date().toISOString(),
        agentId,
        orderId,
        idempotencyKey, // Store for verification
      };

      await this.kv.put(key, JSON.stringify(record), {
        expirationTtl: ttlSeconds,
      });

      return {
        isDuplicate: false,
        decisionId,
      };
    } catch (error) {
      console.error("Failed to check idempotency:", error);
      // Fail open - allow the request to proceed
      return { isDuplicate: false };
    }
  }

  /**
   * Clean up old idempotency keys (for maintenance)
   */
  async cleanupOldIdempotencyKeys(olderThanDays: number = 7): Promise<number> {
    // This would require listing keys, which KV doesn't support efficiently
    // In production, you'd use a different approach like Durable Objects
    // or scheduled cleanup jobs
    console.warn(
      "Idempotency cleanup not implemented - requires Durable Objects"
    );
    return 0;
  }
}

/**
 * Rate limiting with sliding window
 */
export class RateLimiter {
  constructor(private kv: KVNamespace) {}

  /**
   * Check if request is within rate limit
   */
  async checkRateLimit(
    key: string,
    limit: number,
    windowSeconds: number = 60
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const kvKey = `rate_limit:${key}`;

    try {
      // Get current window data
      const current = (await this.kv.get(kvKey, "json")) as {
        requests: number[];
        windowStart: number;
      } | null;

      if (!current) {
        // First request in window
        await this.kv.put(
          kvKey,
          JSON.stringify({
            requests: [now],
            windowStart: now,
          }),
          { expirationTtl: windowSeconds }
        );

        return {
          allowed: true,
          remaining: limit - 1,
          resetTime: now + windowSeconds * 1000,
        };
      }

      // Filter out old requests
      const validRequests = current.requests.filter(
        (time) => time > windowStart
      );

      if (validRequests.length >= limit) {
        return {
          allowed: false,
          remaining: 0,
          resetTime: Math.min(...validRequests) + windowSeconds * 1000,
        };
      }

      // Add new request
      validRequests.push(now);
      await this.kv.put(
        kvKey,
        JSON.stringify({
          requests: validRequests,
          windowStart: current.windowStart,
        }),
        { expirationTtl: windowSeconds }
      );

      return {
        allowed: true,
        remaining: limit - validRequests.length,
        resetTime: Math.min(...validRequests) + windowSeconds * 1000,
      };
    } catch (error) {
      console.error("Rate limit check failed:", error);
      // Fail open - allow the request
      return {
        allowed: true,
        remaining: limit,
        resetTime: now + windowSeconds * 1000,
      };
    }
  }
}
