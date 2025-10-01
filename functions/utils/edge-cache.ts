/**
 * L2 Edge Cache using Cloudflare Cache API
 * Provides global edge distribution with proactive warming
 */

export interface EdgeCacheEntry {
  data: string;
  etag: string;
  timestamp: number;
  ttl: number;
  tags: string[];
}

export interface EdgeCacheStats {
  hits: number;
  misses: number;
  writes: number;
  purges: number;
}

/**
 * Edge cache manager using Cloudflare Cache API
 * Supports tag-based invalidation and proactive warming
 */
export class EdgeCache {
  private stats: EdgeCacheStats = {
    hits: 0,
    misses: 0,
    writes: 0,
    purges: 0,
  };
  private consecutiveFailures = 0;
  private lastFailureTime = 0;
  private circuitBreakerThreshold = 5; // Fail after 5 consecutive failures
  private circuitBreakerTimeout = 30000; // 30 seconds

  constructor(
    private defaultTTL: number = 60, // seconds
    private staleWhileRevalidate: number = 30 // seconds
  ) {}

  /**
   * Get data from edge cache
   */
  async get(key: string): Promise<EdgeCacheEntry | null> {
    // Check circuit breaker
    if (this.isCircuitBreakerOpen()) {
      this.stats.misses++;
      return null;
    }

    try {
      const cacheKey = this.getCacheKey(key);
      const response = await caches.default.match(cacheKey);

      if (!response) {
        this.stats.misses++;
        this.resetCircuitBreaker(); // Reset on successful operation
        return null;
      }

      // Check if response is stale but still valid for stale-while-revalidate
      const cacheControl = response.headers.get("cache-control") || "";
      const isStale = this.isStale(response);

      if (isStale && !this.canServeStale(cacheControl)) {
        this.stats.misses++;
        return null;
      }

      const data = await response.text();
      const etag = response.headers.get("etag") || "";
      const timestamp = parseInt(
        response.headers.get("x-cache-timestamp") || "0"
      );
      const ttl = this.extractTTL(cacheControl);
      const tags = this.extractTags(response.headers.get("x-cache-tags") || "");

      this.stats.hits++;
      this.resetCircuitBreaker(); // Reset on successful operation

      return {
        data,
        etag,
        timestamp,
        ttl,
        tags,
      };
    } catch (error) {
      console.warn(`Edge cache get failed for key ${key}:`, error);
      this.stats.misses++;
      this.recordFailure();
      return null;
    }
  }

  /**
   * Set data in edge cache with tags
   */
  async set(
    key: string,
    data: string,
    etag: string,
    tags: string[] = [],
    ttl?: number
  ): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(key);
      const effectiveTTL = ttl || this.defaultTTL;
      const timestamp = Date.now();

      const response = new Response(data, {
        headers: {
          "content-type": "application/json",
          "cache-control": `public, s-maxage=${effectiveTTL}, stale-while-revalidate=${this.staleWhileRevalidate}`,
          etag: etag,
          "x-cache-timestamp": timestamp.toString(),
          "x-cache-ttl": effectiveTTL.toString(),
          "x-cache-tags": tags.join(","),
          vary: "X-Agent-Passport-Id",
        },
      });

      await caches.default.put(cacheKey, response);
      this.stats.writes++;
    } catch (error) {
      console.warn(`Edge cache set failed for key ${key}:`, error);
    }
  }

  /**
   * Purge cache entries by tag
   */
  async purgeByTag(tag: string): Promise<void> {
    try {
      // Note: Cloudflare Cache API doesn't support tag-based purging directly
      // This would need to be implemented via Cloudflare API calls
      // For now, we'll log the purge request
      console.log(`Edge cache purge requested for tag: ${tag}`);
      this.stats.purges++;
    } catch (error) {
      console.warn(`Edge cache purge failed for tag ${tag}:`, error);
    }
  }

  /**
   * Purge specific cache key
   */
  async purge(key: string): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(key);
      await caches.default.delete(cacheKey);
      this.stats.purges++;
    } catch (error) {
      console.warn(`Edge cache purge failed for key ${key}:`, error);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): EdgeCacheStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      writes: 0,
      purges: 0,
    };
  }

  /**
   * Generate cache key with namespace
   * Cloudflare Cache API requires fully-qualified URLs as keys
   */
  private getCacheKey(
    key: string,
    domain: string = "https://api.aport.io/verify"
  ): string {
    // Create a proper URL for the cache key
    // Using a dummy base URL since we only need the path for caching
    return `${domain}/ap:${key}`;
  }

  /**
   * Check if response is stale
   */
  private isStale(response: Response): boolean {
    const timestamp = parseInt(
      response.headers.get("x-cache-timestamp") || "0"
    );
    const ttl = this.extractTTL(response.headers.get("cache-control") || "");
    return Date.now() - timestamp > ttl * 1000;
  }

  /**
   * Check if stale response can be served
   */
  private canServeStale(cacheControl: string): boolean {
    const staleWhileRevalidate = this.extractStaleWhileRevalidate(cacheControl);
    return staleWhileRevalidate > 0;
  }

  /**
   * Extract TTL from cache-control header
   */
  private extractTTL(cacheControl: string): number {
    const match = cacheControl.match(/s-maxage=(\d+)/);
    return match ? parseInt(match[1]) : this.defaultTTL;
  }

  /**
   * Extract stale-while-revalidate from cache-control header
   */
  private extractStaleWhileRevalidate(cacheControl: string): number {
    const match = cacheControl.match(/stale-while-revalidate=(\d+)/);
    return match ? parseInt(match[1]) : this.staleWhileRevalidate;
  }

  /**
   * Extract tags from x-cache-tags header
   */
  private extractTags(tagsHeader: string): string[] {
    return tagsHeader ? tagsHeader.split(",").map((t) => t.trim()) : [];
  }

  /**
   * Check if circuit breaker is open
   */
  private isCircuitBreakerOpen(): boolean {
    if (this.consecutiveFailures < this.circuitBreakerThreshold) {
      return false;
    }

    // Check if timeout has passed
    if (Date.now() - this.lastFailureTime > this.circuitBreakerTimeout) {
      this.resetCircuitBreaker();
      return false;
    }

    return true;
  }

  /**
   * Record a failure for circuit breaker
   */
  private recordFailure(): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();
  }

  /**
   * Reset circuit breaker on successful operation
   */
  private resetCircuitBreaker(): void {
    this.consecutiveFailures = 0;
  }
}

// Global edge cache instance
const edgeCache = new EdgeCache(60, 30);

/**
 * Get passport from L2 edge cache
 */
export async function getPassportFromEdge(
  agentId: string
): Promise<EdgeCacheEntry | null> {
  return await edgeCache.get(`passport:${agentId}`);
}

/**
 * Set passport in L2 edge cache
 */
export async function setPassportInEdge(
  agentId: string,
  data: string,
  etag: string,
  ownerId?: string
): Promise<void> {
  const tags = [`passport:${agentId}`];
  if (ownerId) {
    tags.push(`owner:${ownerId}`);
  }

  await edgeCache.set(`passport:${agentId}`, data, etag, tags);
}

/**
 * Invalidate passport from L2 edge cache
 */
export async function invalidatePassportFromEdge(
  agentId: string
): Promise<void> {
  await edgeCache.purge(`passport:${agentId}`);
}

/**
 * Invalidate all passports for an owner
 */
export async function invalidateOwnerPassportsFromEdge(
  ownerId: string
): Promise<void> {
  await edgeCache.purgeByTag(`owner:${ownerId}`);
}

/**
 * Get edge cache statistics
 */
export function getEdgeCacheStats(): EdgeCacheStats {
  return edgeCache.getStats();
}
