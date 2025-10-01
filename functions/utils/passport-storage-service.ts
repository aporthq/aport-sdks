/**
 * Passport Storage Service
 *
 * Unified storage service for passport operations that can be used by both
 * TenantDO (real implementation) and TenantDO fallback to ensure DRY principles.
 * Handles all multi-stage storage operations: KV, R2, indexes, agent routing, and caching.
 *
 * Multi-region/multi-tenant aware - uses resolved bindings instead of hardcoded defaults.
 */

import { KVNamespace, R2Bucket } from "@cloudflare/workers-types";
import { PassportData } from "../../types/passport";
import { updateIndexes } from "./passport-common";
import { writeAgentRouting, updateAgentRouting } from "./agent-routing";
import { updateOwnerAgentsIndex, updateOrgAgentsIndex } from "./owner-utils";
import { createTieredPassportCache } from "./tiered-cache";
import { invalidatePassportCache } from "./cache-invalidation";
import { preSerializePassport, buildPassportObject } from "./serialization";
import { storeAuditAction } from "./audit-trail";

export interface StorageOptions {
  createBackup?: boolean;
  invalidateCache?: boolean;
  preWarmCache?: boolean;
  reason?: string;
  actor?: string;
  // Multi-region/multi-tenant options
  region?: string;
  version?: string;
  tenantId?: string;
}

export interface StorageResult {
  success: boolean;
  agentId: string;
  action: "create" | "update" | "status_change";
  latency: number;
  cacheInvalidated: boolean;
  backupCreated: boolean;
  error?: string;
}

/**
 * Unified passport storage service
 * Handles all storage operations for both TenantDO and fallback implementations
 * Multi-region/multi-tenant aware - uses resolved bindings
 */
export class PassportStorageService {
  private kv: KVNamespace;
  private r2?: R2Bucket;
  private region: string;
  private version: string;
  private tenantId?: string;

  constructor(
    kv: KVNamespace,
    options: {
      r2?: R2Bucket;
      region?: string;
      version?: string;
      tenantId?: string;
    } = {}
  ) {
    this.kv = kv;
    this.r2 = options.r2;
    // Use provided region or fallback to "US" - no hardcoding
    this.region = options.region || "US";
    // Use provided version or fallback to "1.0.0" - no hardcoding
    this.version = options.version || "1.0.0";
    this.tenantId = options.tenantId;
  }

  /**
   * Create a passport with full storage operations
   * Multi-region/multi-tenant aware
   */
  async createPassport(
    passport: PassportData,
    options: StorageOptions = {}
  ): Promise<StorageResult> {
    const startTime = Date.now();
    const {
      createBackup = true,
      invalidateCache = true,
      preWarmCache = true,
      reason = "Passport created",
      actor = "system",
      // Multi-region/multi-tenant options
      region = this.region,
      version = this.version,
      tenantId = this.tenantId,
    } = options;

    try {
      // Step 1: Write passport data to KV
      const passportKey = `passport:${passport.agent_id}`;
      console.log(
        `PassportStorageService: Storing passport with key: ${passportKey}`
      );
      console.log(`PassportStorageService: Using KV namespace:`, this.kv);
      await this.kv.put(passportKey, JSON.stringify(passport));
      console.log(
        `PassportStorageService: Successfully stored passport with key: ${passportKey}`
      );

      // Step 2: Write agent routing information for fast routing
      await writeAgentRouting(
        this.kv,
        passport.agent_id,
        passport.owner_id,
        region, // Use resolved region
        1
      );

      // Step 3: Update indexes
      await updateIndexes(
        this.kv,
        passport.agent_id,
        passport.slug,
        passport.name
      );

      // Step 4: Update owner agents index
      console.log("PassportStorageService: Updating owner agents index for:", {
        ownerId: passport.owner_id,
        agentId: passport.agent_id,
        action: "add",
      });
      await updateOwnerAgentsIndex(
        this.kv,
        passport.owner_id,
        passport.agent_id,
        "add"
      );
      console.log(
        "PassportStorageService: Owner agents index updated successfully"
      );

      // Step 5: Update org agents index if owner is an organization
      if (passport.owner_type === "org") {
        await updateOrgAgentsIndex(
          this.kv,
          passport.owner_id,
          passport.agent_id,
          "add"
        );
      }

      // Step 6: Pre-serialize for performance
      await preSerializePassport(
        this.kv,
        passport.agent_id,
        passport,
        version // Use resolved version
      );

      // Step 7: Parallel operations for maximum speed
      const operations = [
        // Create R2 backup if enabled and available
        createBackup && this.r2
          ? this.createR2Backup(passport, "create", actor, {
              reason,
              region,
              tenantId,
            })
          : Promise.resolve(),
        // Invalidate cache if enabled
        invalidateCache
          ? this.invalidateAllCaches(passport.agent_id, passport.owner_id)
          : Promise.resolve(),
        // Pre-warm cache if enabled
        preWarmCache
          ? this.preWarmCache(passport.agent_id, passport)
          : Promise.resolve(),
      ];

      // Execute operations in parallel
      await Promise.all(operations);

      const latency = Date.now() - startTime;

      return {
        success: true,
        agentId: passport.agent_id,
        action: "create",
        latency,
        cacheInvalidated: invalidateCache,
        backupCreated: createBackup && !!this.r2,
      };
    } catch (error) {
      console.error(`Failed to create passport ${passport.agent_id}:`, error);
      return {
        success: false,
        agentId: passport.agent_id,
        action: "create",
        latency: Date.now() - startTime,
        cacheInvalidated: false,
        backupCreated: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Update a passport with full storage operations
   * Multi-region/multi-tenant aware
   */
  async updatePassport(
    passport: PassportData,
    previousPassport: PassportData,
    options: StorageOptions = {}
  ): Promise<StorageResult> {
    const startTime = Date.now();
    const {
      createBackup = true,
      invalidateCache = true,
      preWarmCache = true,
      reason = "Passport updated",
      actor = "system",
      // Multi-region/multi-tenant options
      region = this.region,
      version = this.version,
      tenantId = this.tenantId,
    } = options;

    try {
      // Step 1: Write updated passport data to KV
      await this.kv.put(
        `passport:${passport.agent_id}`,
        JSON.stringify(passport)
      );

      // Step 2: Check if owner or region changed and update agent routing if needed
      const currentAgentInfo = (await this.kv.get(
        `agent_info:${passport.agent_id}`,
        "json"
      )) as any;
      if (currentAgentInfo) {
        const ownerChanged = currentAgentInfo.owner_id !== passport.owner_id;
        const regionChanged = currentAgentInfo.region !== region;

        if (ownerChanged || regionChanged) {
          await updateAgentRouting(
            this.kv,
            passport.agent_id,
            passport.owner_id,
            region, // Use resolved region
            currentAgentInfo.version
          );
        }
      }

      // Step 3: Update indexes
      await updateIndexes(
        this.kv,
        passport.agent_id,
        passport.slug,
        passport.name
      );

      // Step 4: Pre-serialize for performance
      await preSerializePassport(
        this.kv,
        passport.agent_id,
        passport,
        version // Use resolved version
      );

      // Step 5: Parallel operations for maximum speed
      const operations = [
        // Create R2 backup if enabled and available
        createBackup && this.r2
          ? this.createR2Backup(
              passport,
              "update",
              actor,
              { reason, region, tenantId },
              previousPassport
            )
          : Promise.resolve(),
        // Invalidate cache if enabled
        invalidateCache
          ? this.invalidateAllCaches(passport.agent_id, passport.owner_id)
          : Promise.resolve(),
        // Pre-warm cache if enabled
        preWarmCache
          ? this.preWarmCache(passport.agent_id, passport)
          : Promise.resolve(),
      ];

      // Execute operations in parallel
      await Promise.all(operations);

      const latency = Date.now() - startTime;

      return {
        success: true,
        agentId: passport.agent_id,
        action: "update",
        latency,
        cacheInvalidated: invalidateCache,
        backupCreated: createBackup && !!this.r2,
      };
    } catch (error) {
      console.error(`Failed to update passport ${passport.agent_id}:`, error);
      return {
        success: false,
        agentId: passport.agent_id,
        action: "update",
        latency: Date.now() - startTime,
        cacheInvalidated: false,
        backupCreated: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Change passport status with full storage operations
   * Multi-region/multi-tenant aware
   */
  async changeStatus(
    agentId: string,
    status: "draft" | "active" | "suspended" | "revoked",
    reason?: string,
    options: StorageOptions = {}
  ): Promise<StorageResult> {
    const startTime = Date.now();
    const {
      createBackup = true,
      invalidateCache = true,
      preWarmCache = true,
      reason: storageReason = "Status changed",
      actor = "system",
      // Multi-region/multi-tenant options
      region = this.region,
      version = this.version,
      tenantId = this.tenantId,
    } = options;

    try {
      // Step 1: Get current passport
      const currentPassport = (await this.kv.get(
        `passport:${agentId}`,
        "json"
      )) as any;
      if (!currentPassport) {
        throw new Error("Passport not found");
      }

      // Step 2: Update passport with new status
      const updatedPassport = {
        ...currentPassport,
        status,
        reason,
        updated_at: new Date().toISOString(),
        version_number: (currentPassport.version_number || 1) + 1,
      };

      // Step 3: Write updated passport to KV
      await this.kv.put(`passport:${agentId}`, JSON.stringify(updatedPassport));

      // Step 4: Pre-serialize for performance
      await preSerializePassport(
        this.kv,
        agentId,
        updatedPassport,
        version // Use resolved version
      );

      // Step 5: Parallel operations for maximum speed
      const operations = [
        // Create R2 backup if enabled and available
        createBackup && this.r2
          ? this.createR2Backup(
              updatedPassport,
              "status_change",
              actor,
              { reason: storageReason, region, tenantId },
              currentPassport
            )
          : Promise.resolve(),
        // Invalidate cache if enabled
        invalidateCache
          ? this.invalidateAllCaches(agentId, currentPassport.owner_id)
          : Promise.resolve(),
        // Pre-warm cache if enabled
        preWarmCache
          ? this.preWarmCache(agentId, updatedPassport)
          : Promise.resolve(),
      ];

      // Execute operations in parallel
      await Promise.all(operations);

      const latency = Date.now() - startTime;

      return {
        success: true,
        agentId,
        action: "status_change",
        latency,
        cacheInvalidated: invalidateCache,
        backupCreated: createBackup && !!this.r2,
      };
    } catch (error) {
      console.error(`Failed to change status for passport ${agentId}:`, error);
      return {
        success: false,
        agentId,
        action: "status_change",
        latency: Date.now() - startTime,
        cacheInvalidated: false,
        backupCreated: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Create R2 backup
   */
  private async createR2Backup(
    passport: PassportData,
    action: string,
    actor: string,
    metadata: { reason?: string; region?: string; tenantId?: string },
    previousPassport?: PassportData
  ): Promise<void> {
    if (!this.r2) return;

    try {
      const region = metadata.region || this.region;
      const version = this.version;
      const tenantId = metadata.tenantId || this.tenantId;

      const passportObject = buildPassportObject(passport, version);
      const backupKey = `passports/${region}/${
        passport.agent_id
      }/${Date.now()}_${action}.json`;

      const backupData = {
        action,
        actor,
        timestamp: new Date().toISOString(),
        region,
        tenantId,
        metadata,
        passport: passportObject,
        previous: previousPassport
          ? buildPassportObject(previousPassport, version)
          : undefined,
      };

      await this.r2.put(backupKey, JSON.stringify(backupData, null, 2), {
        httpMetadata: {
          contentType: "application/json",
          cacheControl: "public, max-age=300",
        },
      });

      console.log(
        `Successfully backed up passport ${passport.agent_id} to R2: ${backupKey}`
      );
    } catch (error) {
      console.warn(
        `Failed to create R2 backup for passport ${passport.agent_id}:`,
        error
      );
      // Don't throw - backup failures shouldn't break the main operation
    }
  }

  /**
   * Invalidate all caches
   */
  private async invalidateAllCaches(
    agentId: string,
    ownerId?: string
  ): Promise<void> {
    try {
      // Invalidate passport cache
      await invalidatePassportCache(agentId, ownerId);

      // Invalidate tiered cache
      const tieredCache = createTieredPassportCache(this.kv);
      await tieredCache.invalidatePassport(agentId);

      console.log(`Successfully invalidated caches for passport ${agentId}`);
    } catch (error) {
      console.warn(
        `Failed to invalidate caches for passport ${agentId}:`,
        error
      );
      // Don't throw - cache invalidation failures shouldn't break the main operation
    }
  }

  /**
   * Pre-warm cache
   */
  private async preWarmCache(
    agentId: string,
    passport: PassportData
  ): Promise<void> {
    try {
      const tieredCache = createTieredPassportCache(this.kv);
      await tieredCache.preWarmPassport(agentId, passport);

      console.log(`Successfully pre-warmed cache for passport ${agentId}`);
    } catch (error) {
      console.warn(`Failed to pre-warm cache for passport ${agentId}:`, error);
      // Don't throw - cache pre-warming failures shouldn't break the main operation
    }
  }
}

/**
 * Create a passport storage service instance
 * Multi-region/multi-tenant aware
 */
export function createPassportStorageService(
  kv: KVNamespace,
  options: {
    r2?: R2Bucket;
    region?: string;
    version?: string;
    tenantId?: string;
  } = {}
): PassportStorageService {
  return new PassportStorageService(kv, options);
}
