/**
 * Tiered Cache Manager
 * Orchestrates L1 (Memory), L2 (Edge), and L3 (KV) caches
 * Implements Option A conservative optimization strategy
 */

import { KVNamespace } from "@cloudflare/workers-types";
import { PassportData } from "../../types/passport";
import {
  getPassportFromMemory,
  setPassportInMemory,
  getSerializedPassportFromMemory,
  setSerializedPassportInMemory,
  invalidatePassportFromMemory,
  getMemoryCacheStats,
  cleanupMemoryCaches,
} from "./memory-cache";
import {
  getPassportFromEdge,
  setPassportInEdge,
  invalidatePassportFromEdge,
  getEdgeCacheStats,
} from "./edge-cache";
import { createKVCache, KVCache } from "./kv-cache";

export interface TieredCacheStats {
  l1: ReturnType<typeof getMemoryCacheStats>;
  l2: ReturnType<typeof getEdgeCacheStats>;
  l3: ReturnType<KVCache["getStats"]>;
  totalRequests: number;
  avgLatency: number;
}

export interface PassportCacheResult {
  passport: any;
  etag: string;
  source: "l1" | "l2" | "l3";
  latency: number;
  fromCache: boolean;
}

/**
 * Tiered cache manager for passport data
 * Implements conservative 3-tier caching strategy
 */
export class TieredPassportCache {
  private kvCache: KVCache;
  private totalRequests = 0;
  private totalLatency = 0;
  private pendingRequests = new Map<
    string,
    Promise<PassportCacheResult | null>
  >();
  private version: string;

  constructor(kv: KVNamespace, version: string = "0.1") {
    this.kvCache = createKVCache(kv);
    this.version = version;
  }

  /**
   * Get passport with 3-tier fallback strategy
   * L1 (Memory) -> L2 (Edge) -> L3 (KV)
   * Includes race condition protection and input validation
   */
  async getPassport(agentId: string): Promise<PassportCacheResult | null> {
    // Input validation
    if (
      !agentId ||
      typeof agentId !== "string" ||
      agentId.trim().length === 0
    ) {
      console.warn("Invalid agentId provided to getPassport:", agentId);
      return null;
    }

    // Normalize agentId
    const normalizedAgentId = agentId.trim();

    // Check for pending request to prevent race conditions
    if (this.pendingRequests.has(normalizedAgentId)) {
      return await this.pendingRequests.get(normalizedAgentId)!;
    }

    // Create the request promise
    const requestPromise = this._getPassportInternal(normalizedAgentId);
    this.pendingRequests.set(normalizedAgentId, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Clean up pending request
      this.pendingRequests.delete(normalizedAgentId);
    }
  }

  /**
   * Internal method to get passport with 3-tier fallback strategy
   */
  private async _getPassportInternal(
    agentId: string
  ): Promise<PassportCacheResult | null> {
    const startTime = Date.now();
    this.totalRequests++;

    // L1: Memory Cache (Target: <1ms)
    const l1Start = Date.now();
    const l1Serialized = getSerializedPassportFromMemory(agentId);
    const l1Latency = Date.now() - l1Start;

    if (l1Serialized) {
      const totalLatency = Date.now() - startTime;
      this.totalLatency += totalLatency;

      return {
        passport: l1Serialized.json,
        etag: l1Serialized.etag,
        source: "l1",
        latency: totalLatency,
        fromCache: true,
      };
    }

    // L2: Edge Cache (Target: <5ms)
    const l2Start = Date.now();
    const l2Result = await getPassportFromEdge(agentId);
    const l2Latency = Date.now() - l2Start;

    if (l2Result) {
      try {
        // Safely parse JSON data
        const passportData = JSON.parse(l2Result.data);

        // Populate L1 cache for next request
        setSerializedPassportInMemory(agentId, {
          json: passportData,
          etag: l2Result.etag,
          timestamp: l2Result.timestamp,
        });

        const totalLatency = Date.now() - startTime;
        this.totalLatency += totalLatency;

        return {
          passport: passportData,
          etag: l2Result.etag,
          source: "l2",
          latency: totalLatency,
          fromCache: true,
        };
      } catch (error) {
        console.warn(`Failed to parse L2 cache data for ${agentId}:`, error);
        // Continue to L3 cache
      }
    }

    // L3: KV Cache (Target: <15ms)
    const l3Start = Date.now();
    const l3Result = await this.kvCache.getSerializedPassport(agentId);
    const l3Latency = Date.now() - l3Start;

    if (l3Result.data) {
      // Populate both L1 and L2 caches
      setSerializedPassportInMemory(agentId, l3Result.data);

      await setPassportInEdge(
        agentId,
        JSON.stringify(l3Result.data.json),
        l3Result.data.etag
      );

      const totalLatency = Date.now() - startTime;
      this.totalLatency += totalLatency;

      return {
        passport: l3Result.data.json,
        etag: l3Result.data.etag,
        source: "l3",
        latency: totalLatency,
        fromCache: false,
      };
    }

    // Fallback to raw KV data
    const rawResult = await this.kvCache.getPassport(agentId);
    if (rawResult.data) {
      // Build passport object and serialize
      const { buildPassportObject } = await import("./serialization");
      const passport = buildPassportObject(rawResult.data, this.version);
      const etag = this.generateETag(passport);
      const serializedData = {
        json: passport,
        etag: etag,
        timestamp: Date.now(),
      };

      // Populate all caches
      setSerializedPassportInMemory(agentId, serializedData);
      await setPassportInEdge(agentId, JSON.stringify(passport), etag);

      const totalLatency = Date.now() - startTime;
      this.totalLatency += totalLatency;

      return {
        passport: passport,
        etag: etag,
        source: "l3",
        latency: totalLatency,
        fromCache: false,
      };
    }

    const totalLatency = Date.now() - startTime;
    this.totalLatency += totalLatency;
    return null;
  }

  /**
   * Pre-warm cache for frequently accessed passports
   */
  async preWarmPassport(
    agentId: string,
    passport: PassportData
  ): Promise<void> {
    try {
      const { buildPassportObject } = await import("./serialization");
      const passportObj = buildPassportObject(passport, this.version);
      const etag = this.generateETag(passportObj);
      const serializedData = {
        json: passportObj,
        etag: etag,
        timestamp: Date.now(),
      };

      // Populate all cache tiers
      setSerializedPassportInMemory(agentId, serializedData);
      await setPassportInEdge(agentId, JSON.stringify(passportObj), etag);

      // Also store in KV for persistence
      await this.kvCache.setSerializedPassport(agentId, serializedData);
    } catch (error) {
      console.warn(`Failed to pre-warm passport ${agentId}:`, error);
    }
  }

  /**
   * Invalidate passport from all cache tiers
   */
  async invalidatePassport(agentId: string): Promise<void> {
    try {
      // L1: Memory cache (immediate)
      invalidatePassportFromMemory(agentId);

      // L2: Edge cache (immediate)
      await invalidatePassportFromEdge(agentId);

      // L3: KV cache (delete both raw and serialized versions)
      await Promise.all([
        this.kvCache.delete(`passport:${agentId}`),
        this.kvCache.delete(`passport_serialized:${agentId}`),
      ]);

      console.log(`Successfully invalidated passport cache for ${agentId}`);
    } catch (error) {
      console.error(
        `Failed to invalidate passport cache for ${agentId}:`,
        error
      );
      // Don't throw - invalidation is best effort
    }
  }

  /**
   * Clean up expired entries from all caches
   */
  async cleanup(): Promise<void> {
    // L1: Memory cache cleanup
    cleanupMemoryCaches();

    // L2: Edge cache cleanup (handled by Cloudflare)
    // L3: KV cache cleanup (handled by TTL)
  }

  /**
   * Get comprehensive cache statistics
   */
  getStats(): TieredCacheStats {
    return {
      l1: getMemoryCacheStats(),
      l2: getEdgeCacheStats(),
      l3: this.kvCache.getStats(),
      totalRequests: this.totalRequests,
      avgLatency:
        this.totalRequests > 0 ? this.totalLatency / this.totalRequests : 0,
    };
  }

  /**
   * Reset all statistics
   */
  resetStats(): void {
    this.totalRequests = 0;
    this.totalLatency = 0;
    this.kvCache.resetStats();
  }

  /**
   * Generate ETag for passport
   */
  private generateETag(passport: any): string {
    const etagData = `${passport.agent_id}-${passport.updated_at}-${passport.version}`;
    return `W/"${btoa(etagData).replace(
      /[+/=]/g,
      (m: string) =>
        ({ "+": "-", "/": "_", "=": "" }[
          m as keyof { "+": string; "/": string; "=": string }
        ])
    )}"`;
  }
}

/**
 * Create tiered cache instance
 */
export function createTieredPassportCache(
  kv: KVNamespace,
  version: string = "0.1"
): TieredPassportCache {
  return new TieredPassportCache(kv, version);
}
