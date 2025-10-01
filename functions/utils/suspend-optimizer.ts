/**
 * Suspend Flow Optimizer
 * Achieves <10ms suspend operations with immediate cache invalidation
 */

import { KVNamespace, R2Bucket } from "@cloudflare/workers-types";
import { PassportData } from "../../types/passport";
import { createTieredPassportCache } from "./tiered-cache";
import { invalidatePassportCache } from "./cache-invalidation";
import { createPassportBackupManager } from "./passport-backup";

export interface SuspendResult {
  success: boolean;
  agentId: string;
  newStatus: string;
  previousStatus: string;
  updatedAt: string;
  latency: number;
  cacheInvalidated: boolean;
}

/**
 * Ultra-fast suspend operation with immediate cache invalidation
 * Target: <10ms total latency
 */
export class SuspendOptimizer {
  private tieredCache: ReturnType<typeof createTieredPassportCache>;
  public kvCache: any; // Expose for direct access
  private backupManager?: ReturnType<typeof createPassportBackupManager>;

  constructor(kv: KVNamespace, version: string, r2Bucket?: R2Bucket) {
    this.tieredCache = createTieredPassportCache(kv, version);
    this.kvCache = (this.tieredCache as any).kvCache; // Access private kvCache

    // Initialize backup manager if R2 bucket is provided
    if (r2Bucket) {
      this.backupManager = createPassportBackupManager(r2Bucket, version);
    }
  }

  /**
   * Suspend passport with immediate cache invalidation
   * Optimized for <10ms response time
   */
  async suspendPassport(
    agentId: string,
    newStatus: "active" | "suspended",
    ownerId?: string
  ): Promise<SuspendResult> {
    const startTime = Date.now();

    try {
      // Step 1: Get current passport (L1 cache - <1ms)
      const currentResult = await this.tieredCache.getPassport(agentId);
      if (!currentResult) {
        throw new Error("Passport not found");
      }

      const currentPassport = currentResult.passport;

      // Ensure we have an object, not a string
      // The passport might come from cache as a string (L1/L2) or as an object (L3)
      const currentPassportObj =
        typeof currentPassport === "string"
          ? JSON.parse(currentPassport)
          : currentPassport;

      const previousStatus = currentPassportObj.status;

      // Step 2: Validate status change
      if (currentPassportObj.status === newStatus) {
        return {
          success: false,
          agentId,
          newStatus,
          previousStatus,
          updatedAt: currentPassportObj.updated_at,
          latency: Date.now() - startTime,
          cacheInvalidated: false,
        };
      }

      // Step 3: Create updated passport (immediate - <1ms)
      const updatedPassport: PassportData = {
        ...currentPassportObj,
        status: newStatus,
        updated_at: new Date().toISOString(),
      };

      // Step 4: Create backup before making changes (non-blocking)
      const backupPromise = this.createBackup(
        updatedPassport,
        currentPassportObj,
        newStatus,
        previousStatus,
        ownerId || "unknown"
      );

      // Step 5: Parallel operations for maximum speed
      const operations = [
        // Update raw passport in KV
        this.updatePassportInKV(agentId, updatedPassport),
        // Invalidate all cache tiers immediately
        this.invalidateAllCaches(agentId, ownerId),
        // Pre-warm cache with new data
        this.preWarmCache(agentId, updatedPassport),
        // Create backup (non-blocking)
        backupPromise,
      ];

      // Execute all operations in parallel
      await Promise.all(operations);

      const latency = Date.now() - startTime;

      return {
        success: true,
        agentId,
        newStatus,
        previousStatus,
        updatedAt: updatedPassport.updated_at,
        latency,
        cacheInvalidated: true,
      };
    } catch (error) {
      console.error(`Suspend operation failed for ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Update passport in KV (optimized)
   */
  private async updatePassportInKV(
    agentId: string,
    passport: PassportData | string
  ): Promise<void> {
    // Ensure we have an object, not a string
    // The passport might come from cache as a string (L1/L2) or as an object (L3)
    const passportObj =
      typeof passport === "string" ? JSON.parse(passport) : passport;

    // Store directly in KV using the tiered cache's KV access
    await this.kvCache.setPassport(agentId, passportObj, 3600);
  }

  /**
   * Invalidate all cache tiers immediately
   */
  private async invalidateAllCaches(
    agentId: string,
    ownerId?: string
  ): Promise<void> {
    // Use our optimized invalidation
    await invalidatePassportCache(agentId, ownerId);
  }

  /**
   * Pre-warm cache with new data
   */
  private async preWarmCache(
    agentId: string,
    passport: PassportData | string
  ): Promise<void> {
    // Ensure we have an object, not a string
    // The passport might come from cache as a string (L1/L2) or as an object (L3)
    const passportObj =
      typeof passport === "string" ? JSON.parse(passport) : passport;

    // Pre-warm all cache tiers with new data
    await this.tieredCache.preWarmPassport(agentId, passportObj);
  }

  /**
   * Create backup of passport data
   */
  private async createBackup(
    updatedPassport: PassportData,
    currentPassport: PassportData,
    newStatus: string,
    previousStatus: string,
    actor: string
  ): Promise<void> {
    if (!this.backupManager) {
      // No backup manager configured, skip silently
      return;
    }

    try {
      const backupResult = await this.backupManager.backupStatusChange(
        updatedPassport,
        previousStatus,
        newStatus,
        actor,
        `Status changed from ${previousStatus} to ${newStatus}`
      );

      if (backupResult.success) {
        console.log(
          `Backup created for ${updatedPassport.agent_id}: ${backupResult.backupKey}`
        );
      } else {
        console.warn(
          `Backup failed for ${updatedPassport.agent_id}: ${backupResult.error}`
        );
      }
    } catch (error) {
      console.error(`Backup error for ${updatedPassport.agent_id}:`, error);
      // Don't throw - backup failures shouldn't break the main operation
    }
  }

  /**
   * Batch suspend multiple passports
   */
  async batchSuspend(
    operations: Array<{
      agentId: string;
      newStatus: "active" | "suspended";
      ownerId?: string;
    }>
  ): Promise<SuspendResult[]> {
    const startTime = Date.now();

    // Process all operations in parallel
    const results = await Promise.all(
      operations.map(({ agentId, newStatus, ownerId }) =>
        this.suspendPassport(agentId, newStatus, ownerId)
      )
    );

    const totalLatency = Date.now() - startTime;
    console.log(
      `Batch suspend completed in ${totalLatency}ms for ${operations.length} passports`
    );

    return results;
  }
}

/**
 * Create suspend optimizer instance
 */
export function createSuspendOptimizer(
  kv: KVNamespace,
  version: string,
  r2Bucket?: R2Bucket
): SuspendOptimizer {
  return new SuspendOptimizer(kv, version, r2Bucket);
}
