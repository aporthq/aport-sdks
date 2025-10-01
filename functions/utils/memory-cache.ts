/**
 * L1 In-Memory LRU Cache for ultra-fast reads
 * Global per-isolate cache with TTL and size limits
 */

export interface MemoryCacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

export interface MemoryCacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
}

/**
 * Thread-safe in-memory LRU cache with TTL
 * Optimized for Cloudflare Workers isolates
 */
export class MemoryCache<T = any> {
  private cache = new Map<string, MemoryCacheEntry<T>>();
  private accessOrder: string[] = [];
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  constructor(
    private maxSize: number = 256,
    private defaultTTL: number = 30 // seconds
  ) {}

  /**
   * Get data from memory cache
   * Updates access order for LRU eviction
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      this.stats.misses++;
      return null;
    }

    // Update access tracking
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.updateAccessOrder(key);
    this.stats.hits++;

    return entry.data;
  }

  /**
   * Set data in memory cache
   * Evicts LRU entries if at capacity
   */
  set(key: string, data: T, ttl?: number): void {
    const entry: MemoryCacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
      accessCount: 1,
      lastAccessed: Date.now(),
    };

    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.removeFromAccessOrder(key);
    }

    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, entry);
    this.updateAccessOrder(key);
  }

  /**
   * Delete specific key from cache
   */
  delete(key: string): boolean {
    const existed = this.cache.delete(key);
    if (existed) {
      this.removeFromAccessOrder(key);
    }
    return existed;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    let cleaned = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        cleaned++;
      }
    }

    // Also clean up orphaned access order entries
    const cacheKeys = new Set(this.cache.keys());
    const originalLength = this.accessOrder.length;
    this.accessOrder = this.accessOrder.filter((key) => cacheKeys.has(key));
    const orphanedCleaned = originalLength - this.accessOrder.length;

    return cleaned + orphanedCleaned;
  }

  /**
   * Get cache statistics
   */
  getStats(): MemoryCacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: MemoryCacheEntry<T>): boolean {
    return Date.now() - entry.timestamp > entry.ttl * 1000;
  }

  /**
   * Update access order for LRU tracking
   */
  private updateAccessOrder(key: string): void {
    // Remove from current position
    this.removeFromAccessOrder(key);
    // Add to end (most recently used)
    this.accessOrder.push(key);

    // Prevent unbounded growth - keep access order in sync with cache size
    if (this.accessOrder.length > this.cache.size) {
      // Clean up orphaned keys from access order
      const cacheKeys = new Set(this.cache.keys());
      this.accessOrder = this.accessOrder.filter((key) => cacheKeys.has(key));
    }
  }

  /**
   * Remove key from access order
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;

    const lruKey = this.accessOrder[0];
    this.cache.delete(lruKey);
    this.accessOrder.shift();
    this.stats.evictions++;
  }
}

// Global cache instances per isolate
const passportCache = new MemoryCache(256, 30); // 256 entries, 30s TTL
const serializedCache = new MemoryCache(128, 60); // 128 entries, 60s TTL

/**
 * Get passport from L1 memory cache
 */
export function getPassportFromMemory(agentId: string): any | null {
  return passportCache.get(`passport:${agentId}`);
}

/**
 * Set passport in L1 memory cache
 */
export function setPassportInMemory(
  agentId: string,
  passport: any,
  ttl?: number
): void {
  passportCache.set(`passport:${agentId}`, passport, ttl);
}

/**
 * Get serialized passport from L1 memory cache
 */
export function getSerializedPassportFromMemory(agentId: string): any | null {
  return serializedCache.get(`serialized:${agentId}`);
}

/**
 * Set serialized passport in L1 memory cache
 */
export function setSerializedPassportInMemory(
  agentId: string,
  data: any,
  ttl?: number
): void {
  serializedCache.set(`serialized:${agentId}`, data, ttl);
}

/**
 * Invalidate passport from L1 memory cache
 */
export function invalidatePassportFromMemory(agentId: string): void {
  passportCache.delete(`passport:${agentId}`);
  serializedCache.delete(`serialized:${agentId}`);
}

/**
 * Get memory cache statistics
 */
export function getMemoryCacheStats() {
  return {
    passport: passportCache.getStats(),
    serialized: serializedCache.getStats(),
  };
}

/**
 * Clean up expired entries from all caches
 */
export function cleanupMemoryCaches(): number {
  return passportCache.cleanup() + serializedCache.cleanup();
}
