import { KVNamespace } from "@cloudflare/workers-types";

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * Simple in-memory cache for frequently accessed data
 * Uses Cloudflare KV as backing store with in-memory layer
 */
export class Cache {
  private memoryCache = new Map<string, CacheEntry<any>>();
  private kv: KVNamespace;
  private defaultTTL: number;

  constructor(kv: KVNamespace, defaultTTL: number = 60) {
    this.kv = kv;
    this.defaultTTL = defaultTTL;
  }

  /**
   * Get data from cache (memory first, then KV)
   * @param key - Cache key
   * @returns Cached data or null if not found/expired
   */
  async get<T>(key: string): Promise<T | null> {
    // Check memory cache first
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry && this.isValid(memoryEntry)) {
      return memoryEntry.data as T;
    }

    // Check KV store
    try {
      const kvData = await this.kv.get(key, "json");
      if (kvData) {
        const entry: CacheEntry<T> = {
          data: kvData as T,
          timestamp: Date.now(),
          ttl: this.defaultTTL,
        };

        // Store in memory cache
        this.memoryCache.set(key, entry);
        return kvData as T;
      }
    } catch (error) {
      console.error("Cache get error:", error);
    }

    return null;
  }

  /**
   * Set data in cache (both memory and KV)
   * @param key - Cache key
   * @param data - Data to cache
   * @param ttl - Time to live in seconds
   */
  async set<T>(key: string, data: T, ttl?: number): Promise<void> {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    };

    // Store in memory cache
    this.memoryCache.set(key, entry);

    // Store in KV with TTL
    try {
      await this.kv.put(key, JSON.stringify(data), {
        expirationTtl: entry.ttl,
      });
    } catch (error) {
      console.error("Cache set error:", error);
    }
  }

  /**
   * Delete data from cache
   * @param key - Cache key
   */
  async delete(key: string): Promise<void> {
    this.memoryCache.delete(key);
    try {
      await this.kv.delete(key);
    } catch (error) {
      console.error("Cache delete error:", error);
    }
  }

  /**
   * Check if cache entry is valid (not expired)
   * @param entry - Cache entry
   * @returns True if valid, false if expired
   */
  private isValid(entry: CacheEntry<any>): boolean {
    return Date.now() - entry.timestamp < entry.ttl * 1000;
  }

  /**
   * Clear expired entries from memory cache
   */
  cleanup(): void {
    for (const [key, entry] of this.memoryCache.entries()) {
      if (!this.isValid(entry)) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { memoryEntries: number; memorySize: number } {
    return {
      memoryEntries: this.memoryCache.size,
      memorySize: JSON.stringify(Array.from(this.memoryCache.entries())).length,
    };
  }
}

/**
 * Create cache instance
 * @param kv - KV namespace
 * @param defaultTTL - Default TTL in seconds
 * @returns Cache instance
 */
export function createCache(kv: KVNamespace, defaultTTL: number = 60): Cache {
  return new Cache(kv, defaultTTL);
}
