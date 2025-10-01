/**
 * L3 KV Cache with edge cache hints and optimization
 * KV as source of truth with optimized read patterns
 */

import { KVNamespace } from "@cloudflare/workers-types";
import { PassportData } from "../../types/passport";

export interface KVCacheStats {
  reads: number;
  writes: number;
  hits: number;
  misses: number;
  errors: number;
  avgLatency: number;
}

export interface KVReadResult<T> {
  data: T | null;
  fromCache: boolean;
  latency: number;
  error?: string;
}

/**
 * Optimized KV cache with edge hints and connection pooling
 */
export class KVCache {
  private stats: KVCacheStats = {
    reads: 0,
    writes: 0,
    hits: 0,
    misses: 0,
    errors: 0,
    avgLatency: 0,
  };

  private latencyHistory: number[] = [];

  constructor(private kv: KVNamespace) {}

  /**
   * Get data from KV with edge cache hints
   * Optimized for passport data patterns
   */
  async get<T = any>(
    key: string,
    options: {
      type?: "text" | "json" | "arrayBuffer" | "stream";
      cacheTtl?: number;
      allowStale?: boolean;
    } = {}
  ): Promise<KVReadResult<T>> {
    const startTime = Date.now();
    this.stats.reads++;

    try {
      const kvOptions: any = {};

      // Add edge cache hints if TTL specified
      if (options.cacheTtl) {
        kvOptions.cacheTtl = options.cacheTtl;
      }

      const data = await this.kv.get(key, {
        type: options.type || "json",
        ...kvOptions,
      });

      const latency = Date.now() - startTime;
      this.updateLatencyStats(latency);

      if (data !== null) {
        this.stats.hits++;
        return {
          data: data as T,
          fromCache: false, // KV doesn't expose cache status
          latency,
        };
      } else {
        this.stats.misses++;
        return {
          data: null,
          fromCache: false,
          latency,
        };
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      this.stats.errors++;
      this.updateLatencyStats(latency);

      return {
        data: null,
        fromCache: false,
        latency,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get passport data with optimized settings
   */
  async getPassport(agentId: string): Promise<KVReadResult<PassportData>> {
    return this.get<PassportData>(`passport:${agentId}`, {
      type: "json",
      cacheTtl: 60, // 1 minute edge cache
    });
  }

  /**
   * Get serialized passport data with optimized settings
   */
  async getSerializedPassport(agentId: string): Promise<KVReadResult<any>> {
    return this.get<any>(`passport_serialized:${agentId}`, {
      type: "json",
      cacheTtl: 60, // 1 minute edge cache
    });
  }

  /**
   * Set data in KV with TTL
   */
  async set<T = any>(
    key: string,
    data: T,
    options: {
      ttl?: number;
      expirationTtl?: number;
    } = {}
  ): Promise<void> {
    try {
      const kvOptions: any = {};

      if (options.ttl) {
        kvOptions.expirationTtl = options.ttl;
      } else if (options.expirationTtl) {
        kvOptions.expirationTtl = options.expirationTtl;
      }

      await this.kv.put(key, JSON.stringify(data), kvOptions);
      this.stats.writes++;
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Set passport data with optimized TTL
   */
  async setPassport(
    agentId: string,
    passport: PassportData,
    ttl: number = 3600
  ): Promise<void> {
    await this.set(`passport:${agentId}`, passport, { ttl });
  }

  /**
   * Set serialized passport data with optimized TTL
   * Note: This method does NOT stringify the data as it's already serialized
   */
  async setSerializedPassport(
    agentId: string,
    data: any,
    ttl: number = 3600
  ): Promise<void> {
    try {
      const kvOptions: any = {};

      if (ttl) {
        kvOptions.expirationTtl = ttl;
      }

      // Don't stringify - data is already a JavaScript object that needs to be stringified once
      await this.kv.put(
        `passport_serialized:${agentId}`,
        JSON.stringify(data),
        kvOptions
      );
      this.stats.writes++;
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Delete data from KV
   */
  async delete(key: string): Promise<void> {
    try {
      await this.kv.delete(key);
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Batch get multiple keys
   */
  async getMultiple<T = any>(
    keys: string[],
    options: {
      type?: "text" | "json" | "arrayBuffer" | "stream";
      cacheTtl?: number;
    } = {}
  ): Promise<Map<string, KVReadResult<T>>> {
    const results = new Map<string, KVReadResult<T>>();

    // Process in parallel for better performance
    const promises = keys.map(async (key) => {
      const result = await this.get<T>(key, options);
      results.set(key, result);
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Get cache statistics
   */
  getStats(): KVCacheStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      reads: 0,
      writes: 0,
      hits: 0,
      misses: 0,
      errors: 0,
      avgLatency: 0,
    };
    this.latencyHistory = [];
  }

  /**
   * Update latency statistics
   */
  private updateLatencyStats(latency: number): void {
    this.latencyHistory.push(latency);

    // Keep only last 100 measurements for rolling average
    if (this.latencyHistory.length > 100) {
      this.latencyHistory.shift();
    }

    // Calculate rolling average
    const sum = this.latencyHistory.reduce((a, b) => a + b, 0);
    this.stats.avgLatency = sum / this.latencyHistory.length;
  }
}

/**
 * Create KV cache instance
 */
export function createKVCache(kv: KVNamespace): KVCache {
  return new KVCache(kv);
}
