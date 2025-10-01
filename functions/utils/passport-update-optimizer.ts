/**
 * Passport Update Optimizer
 *
 * A unified optimizer for all passport operations (create, update, status changes)
 * with automatic backup, cache invalidation, and performance optimization
 */

import { KVNamespace, R2Bucket } from "@cloudflare/workers-types";
import { PassportData } from "../../types/passport";
import { createTieredPassportCache } from "./tiered-cache";
import { invalidatePassportCache } from "./cache-invalidation";
import { createPassportBackupManager } from "./passport-backup";

export interface UpdateResult {
  success: boolean;
  agentId: string;
  action: "create" | "update" | "status_change";
  previousStatus?: string;
  newStatus?: string;
  updatedAt: string;
  latency: number;
  cacheInvalidated: boolean;
  backupCreated: boolean;
  error?: string;
}

export interface UpdateOptions {
  createBackup?: boolean;
  invalidateCache?: boolean;
  preWarmCache?: boolean;
  reason?: string;
  actor?: string;
}

/**
 * Unified passport update optimizer
 * Handles create, update, and status change operations with optimal performance
 */
export class PassportUpdateOptimizer {
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
   * Create a new passport with optimization
   */
  async createPassport(
    passport: PassportData,
    options: UpdateOptions = {}
  ): Promise<UpdateResult> {
    const startTime = Date.now();
    const {
      createBackup = true,
      invalidateCache = true,
      preWarmCache = true,
      reason = "Passport created",
      actor = "system",
    } = options;

    try {
      // Ensure passport is an object
      const passportData =
        typeof passport === "string" ? JSON.parse(passport) : passport;

      // Step 1: Create backup if enabled
      const backupPromise =
        createBackup && this.backupManager
          ? this.createBackup(passportData, passportData, "create", actor, {
              reason,
            })
          : Promise.resolve();

      // Step 2: Store passport in KV
      await this.kvCache.setPassport(passportData.agent_id, passportData, 3600);

      // Step 3: Parallel operations for maximum speed
      const operations = [
        // Pre-warm cache if enabled
        preWarmCache
          ? this.preWarmCache(passportData.agent_id, passportData)
          : Promise.resolve(),
        // Create backup if enabled
        backupPromise,
      ];

      // Execute operations in parallel
      await Promise.all(operations);

      const latency = Date.now() - startTime;

      return {
        success: true,
        agentId: passportData.agent_id,
        action: "create",
        newStatus: passportData.status,
        updatedAt: passportData.updated_at,
        latency,
        cacheInvalidated: false, // No cache to invalidate for new passports
        backupCreated: createBackup && !!this.backupManager,
      };
    } catch (error) {
      console.error(`Failed to create passport ${passport.agent_id}:`, error);
      return {
        success: false,
        agentId: passport.agent_id,
        action: "create",
        newStatus: passport.status,
        updatedAt: new Date().toISOString(),
        latency: Date.now() - startTime,
        cacheInvalidated: false,
        backupCreated: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Update an existing passport with optimization
   */
  async updatePassport(
    agentId: string,
    updatedPassport: PassportData,
    previousPassport: PassportData,
    options: UpdateOptions = {}
  ): Promise<UpdateResult> {
    const startTime = Date.now();
    const {
      createBackup = true,
      invalidateCache = true,
      preWarmCache = true,
      reason = "Passport updated",
      actor = "system",
    } = options;

    try {
      // Step 1: Create backup if enabled
      const backupPromise =
        createBackup && this.backupManager
          ? this.createBackup(
              updatedPassport,
              previousPassport,
              "update",
              actor,
              { reason }
            )
          : Promise.resolve();

      // Step 2: Store updated passport in KV
      await this.kvCache.setPassport(agentId, updatedPassport, 3600);

      // Step 3: Parallel operations for maximum speed
      const operations = [
        // Invalidate cache if enabled
        invalidateCache
          ? this.invalidateAllCaches(agentId, updatedPassport.owner_id)
          : Promise.resolve(),
        // Pre-warm cache if enabled
        preWarmCache
          ? this.preWarmCache(agentId, updatedPassport)
          : Promise.resolve(),
        // Create backup if enabled
        backupPromise,
      ];

      // Execute operations in parallel
      await Promise.all(operations);

      const latency = Date.now() - startTime;

      return {
        success: true,
        agentId,
        action: "update",
        previousStatus: previousPassport.status,
        newStatus: updatedPassport.status,
        updatedAt: updatedPassport.updated_at,
        latency,
        cacheInvalidated: invalidateCache,
        backupCreated: createBackup && !!this.backupManager,
      };
    } catch (error) {
      console.error(`Failed to update passport ${agentId}:`, error);
      return {
        success: false,
        agentId,
        action: "update",
        previousStatus: previousPassport.status,
        newStatus: updatedPassport.status,
        updatedAt: new Date().toISOString(),
        latency: Date.now() - startTime,
        cacheInvalidated: false,
        backupCreated: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Change passport status with optimization
   */
  async changeStatus(
    agentId: string,
    newStatus: string,
    previousStatus: string,
    ownerId: string,
    options: UpdateOptions = {}
  ): Promise<UpdateResult> {
    const startTime = Date.now();
    const {
      createBackup = true,
      invalidateCache = true,
      preWarmCache = true,
      reason = `Status changed from ${previousStatus} to ${newStatus}`,
      actor = "system",
    } = options;

    try {
      // Step 1: Get current passport
      const currentResult = await this.tieredCache.getPassport(agentId);
      if (!currentResult || !currentResult.passport) {
        throw new Error("Passport not found");
      }

      // Ensure we have an object, not a string
      const currentPassport =
        typeof currentResult.passport === "string"
          ? JSON.parse(currentResult.passport)
          : currentResult.passport;

      // Step 2: Validate status change
      if (currentPassport.status === newStatus) {
        return {
          success: false,
          agentId,
          action: "status_change",
          previousStatus,
          newStatus,
          updatedAt: currentPassport.updated_at,
          latency: Date.now() - startTime,
          cacheInvalidated: false,
          backupCreated: false,
        };
      }

      // Step 3: Create updated passport
      const updatedPassport: PassportData = {
        ...currentPassport,
        status: newStatus,
        updated_at: new Date().toISOString(),
      };

      // Step 4: Create backup if enabled
      const backupPromise =
        createBackup && this.backupManager
          ? this.createBackup(
              updatedPassport,
              currentPassport,
              "status_change",
              actor,
              {
                reason,
                previousStatus,
                newStatus,
              }
            )
          : Promise.resolve();

      // Step 5: Store updated passport in KV
      await this.kvCache.setPassport(agentId, updatedPassport, 3600);

      // Step 6: Parallel operations for maximum speed
      const operations = [
        // Invalidate cache if enabled
        invalidateCache
          ? this.invalidateAllCaches(agentId, ownerId)
          : Promise.resolve(),
        // Pre-warm cache if enabled
        preWarmCache
          ? this.preWarmCache(agentId, updatedPassport)
          : Promise.resolve(),
        // Create backup if enabled
        backupPromise,
      ];

      // Execute operations in parallel
      await Promise.all(operations);

      const latency = Date.now() - startTime;

      return {
        success: true,
        agentId,
        action: "status_change",
        previousStatus,
        newStatus,
        updatedAt: updatedPassport.updated_at,
        latency,
        cacheInvalidated: invalidateCache,
        backupCreated: createBackup && !!this.backupManager,
      };
    } catch (error) {
      console.error(`Failed to change status for passport ${agentId}:`, error);
      return {
        success: false,
        agentId,
        action: "status_change",
        previousStatus,
        newStatus,
        updatedAt: new Date().toISOString(),
        latency: Date.now() - startTime,
        cacheInvalidated: false,
        backupCreated: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Suspend passport (compatibility method for existing suspend optimizer)
   * This method should be used when you know the current status
   */
  async suspendPassport(
    agentId: string,
    newStatus: "active" | "suspended",
    ownerId?: string
  ): Promise<UpdateResult> {
    // Get current passport to determine previous status
    const currentResult = await this.tieredCache.getPassport(agentId);
    if (!currentResult || !currentResult.passport) {
      return {
        success: false,
        agentId,
        action: "status_change",
        newStatus,
        updatedAt: new Date().toISOString(),
        latency: 0,
        cacheInvalidated: false,
        backupCreated: false,
        error: "Passport not found",
      };
    }

    const currentPassport =
      typeof currentResult.passport === "string"
        ? JSON.parse(currentResult.passport)
        : currentResult.passport;

    return this.changeStatus(
      agentId,
      newStatus,
      currentPassport.status,
      ownerId || currentPassport.owner_id || "unknown",
      {
        createBackup: true,
        invalidateCache: true,
        preWarmCache: true,
        reason: `Status changed to ${newStatus}`,
        actor: "system",
      }
    );
  }

  /**
   * Batch update multiple passports
   */
  async batchUpdate(
    updates: Array<{
      agentId: string;
      updatedPassport: PassportData;
      previousPassport: PassportData;
      options?: UpdateOptions;
    }>
  ): Promise<UpdateResult[]> {
    const results = await Promise.all(
      updates.map(({ agentId, updatedPassport, previousPassport, options }) =>
        this.updatePassport(agentId, updatedPassport, previousPassport, options)
      )
    );

    return results;
  }

  /**
   * Invalidate all cache tiers
   */
  private async invalidateAllCaches(
    agentId: string,
    ownerId: string
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
    const passportObj =
      typeof passport === "string" ? JSON.parse(passport) : passport;

    // Pre-warm all cache tiers with new data
    await this.tieredCache.preWarmPassport(agentId, passportObj);
  }

  /**
   * Create backup of passport data
   */
  private async createBackup(
    updatedPassport: PassportData | string,
    previousPassport: PassportData | string,
    action: "create" | "update" | "status_change",
    actor: string,
    metadata?: any
  ): Promise<void> {
    if (!this.backupManager) {
      return;
    }

    try {
      // Ensure passports are objects
      const updatedPassportObj =
        typeof updatedPassport === "string"
          ? JSON.parse(updatedPassport)
          : updatedPassport;
      const previousPassportObj =
        typeof previousPassport === "string"
          ? JSON.parse(previousPassport)
          : previousPassport;

      // Map action types to backup action types
      const backupAction = action === "status_change" ? "suspend" : action;

      const backupResult = await this.backupManager.createBackup(
        updatedPassportObj,
        backupAction as "create" | "update" | "suspend" | "revoke" | "restore",
        actor,
        {
          ...metadata,
          previousStatus: previousPassportObj.status,
          newStatus: updatedPassportObj.status,
        }
      );

      if (backupResult.success) {
        console.log(
          `Backup created for ${updatedPassportObj.agent_id}: ${backupResult.backupKey}`
        );
      } else {
        console.warn(
          `Backup failed for ${updatedPassportObj.agent_id}: ${backupResult.error}`
        );
      }
    } catch (error) {
      const agentId =
        typeof updatedPassport === "string"
          ? JSON.parse(updatedPassport).agent_id
          : updatedPassport.agent_id;
      console.error(`Backup error for ${agentId}:`, error);
      // Don't throw - backup failures shouldn't break the main operation
    }
  }
}

/**
 * Create passport update optimizer instance
 */
export function createPassportUpdateOptimizer(
  kv: KVNamespace,
  version: string,
  r2Bucket?: R2Bucket
): PassportUpdateOptimizer {
  return new PassportUpdateOptimizer(kv, version, r2Bucket);
}
