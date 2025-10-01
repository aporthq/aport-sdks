/**
 * Passport Backup Utility
 * Creates backups of passport data in R2 for data safety and recovery
 */

import { R2Bucket } from "@cloudflare/workers-types";
import { PassportData } from "../../types/passport";

export interface BackupMetadata {
  agentId: string;
  timestamp: string;
  action: "create" | "update" | "suspend" | "revoke" | "restore";
  actor: string;
  previousStatus?: string;
  newStatus?: string;
  reason?: string;
  version: string;
}

export interface BackupResult {
  success: boolean;
  backupKey: string;
  timestamp: string;
  size: number;
  error?: string;
}

/**
 * Passport backup manager
 */
export class PassportBackupManager {
  private bucket: R2Bucket;
  private version: string;

  constructor(bucket: R2Bucket, version: string = "0.1") {
    this.bucket = bucket;
    this.version = version;
  }

  /**
   * Create a backup of passport data
   */
  async createBackup(
    passport: PassportData,
    action: BackupMetadata["action"],
    actor: string,
    metadata?: Partial<BackupMetadata>
  ): Promise<BackupResult> {
    try {
      const timestamp = new Date().toISOString();
      const backupKey = this.generateBackupKey(
        passport.agent_id,
        action,
        timestamp
      );

      const backupData = {
        passport,
        metadata: {
          agentId: passport.agent_id,
          timestamp,
          action,
          actor,
          version: this.version,
          ...metadata,
        } as BackupMetadata,
      };

      const serializedData = JSON.stringify(backupData, null, 2);
      const size = new TextEncoder().encode(serializedData).length;

      await this.bucket.put(backupKey, serializedData, {
        httpMetadata: {
          contentType: "application/json",
          cacheControl: "private, max-age=31536000", // 1 year
        },
        customMetadata: {
          agentId: passport.agent_id,
          action,
          timestamp,
          version: this.version,
        },
      });

      console.log(`Passport backup created: ${backupKey} (${size} bytes)`);

      return {
        success: true,
        backupKey,
        timestamp,
        size,
      };
    } catch (error) {
      console.error(
        `Failed to create passport backup for ${passport.agent_id}:`,
        error
      );
      return {
        success: false,
        backupKey: "",
        timestamp: new Date().toISOString(),
        size: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Create backup for status changes (suspend/revoke/restore)
   */
  async backupStatusChange(
    passport: PassportData,
    previousStatus: string,
    newStatus: string,
    actor: string,
    reason?: string
  ): Promise<BackupResult> {
    const action = this.getActionFromStatusChange(previousStatus, newStatus);

    return this.createBackup(passport, action, actor, {
      previousStatus,
      newStatus,
      reason,
    });
  }

  /**
   * Restore passport from backup
   */
  async restoreFromBackup(backupKey: string): Promise<PassportData | null> {
    try {
      const backup = await this.bucket.get(backupKey);
      if (!backup) {
        console.warn(`Backup not found: ${backupKey}`);
        return null;
      }

      const backupData = (await backup.json()) as {
        passport: PassportData;
        metadata: BackupMetadata;
      };
      return backupData.passport;
    } catch (error) {
      console.error(`Failed to restore from backup ${backupKey}:`, error);
      return null;
    }
  }

  /**
   * List backups for an agent
   */
  async listBackups(
    agentId: string,
    limit: number = 50
  ): Promise<
    Array<{
      key: string;
      timestamp: string;
      action: string;
      size: number;
    }>
  > {
    try {
      const prefix = `passport-backups/${agentId}/`;
      const listResult = await this.bucket.list({
        prefix,
        limit,
      });

      return listResult.objects.map((obj) => ({
        key: obj.key,
        timestamp: obj.uploaded.toISOString(),
        action: obj.customMetadata?.action || "unknown",
        size: obj.size,
      }));
    } catch (error) {
      console.error(`Failed to list backups for ${agentId}:`, error);
      return [];
    }
  }

  /**
   * Get latest backup for an agent
   */
  async getLatestBackup(agentId: string): Promise<{
    key: string;
    passport: PassportData;
    metadata: BackupMetadata;
  } | null> {
    try {
      const backups = await this.listBackups(agentId, 1);
      if (backups.length === 0) {
        return null;
      }

      const latestBackup = backups[0];
      const backup = await this.bucket.get(latestBackup.key);
      if (!backup) {
        return null;
      }

      const backupData = (await backup.json()) as {
        passport: PassportData;
        metadata: BackupMetadata;
      };
      return {
        key: latestBackup.key,
        passport: backupData.passport,
        metadata: backupData.metadata,
      };
    } catch (error) {
      console.error(`Failed to get latest backup for ${agentId}:`, error);
      return null;
    }
  }

  /**
   * Clean up old backups (keep last N backups per agent)
   */
  async cleanupOldBackups(
    agentId: string,
    keepCount: number = 10
  ): Promise<number> {
    try {
      const backups = await this.listBackups(agentId, 1000); // Get all backups
      if (backups.length <= keepCount) {
        return 0;
      }

      // Sort by timestamp descending and get backups to delete
      const sortedBackups = backups.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      const toDelete = sortedBackups.slice(keepCount);
      let deletedCount = 0;

      for (const backup of toDelete) {
        try {
          await this.bucket.delete(backup.key);
          deletedCount++;
        } catch (error) {
          console.warn(`Failed to delete backup ${backup.key}:`, error);
        }
      }

      console.log(`Cleaned up ${deletedCount} old backups for ${agentId}`);
      return deletedCount;
    } catch (error) {
      console.error(`Failed to cleanup backups for ${agentId}:`, error);
      return 0;
    }
  }

  /**
   * Generate backup key
   */
  private generateBackupKey(
    agentId: string,
    action: string,
    timestamp: string
  ): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `passport-backups/${agentId}/${year}/${month}/${day}/${action}_${timestamp.replace(
      /[:.]/g,
      "-"
    )}.json`;
  }

  /**
   * Get action type from status change
   */
  private getActionFromStatusChange(
    previousStatus: string,
    newStatus: string
  ): BackupMetadata["action"] {
    if (previousStatus === "draft" && newStatus === "active") {
      return "create";
    }
    if (newStatus === "suspended") {
      return "suspend";
    }
    if (newStatus === "revoked") {
      return "revoke";
    }
    if (previousStatus === "suspended" && newStatus === "active") {
      return "restore";
    }
    return "update";
  }
}

/**
 * Create passport backup manager instance
 */
export function createPassportBackupManager(
  bucket: R2Bucket,
  version: string = "0.1"
): PassportBackupManager {
  return new PassportBackupManager(bucket, version);
}

/**
 * Quick backup function for status changes
 */
export async function backupPassportStatusChange(
  bucket: R2Bucket,
  passport: PassportData,
  previousStatus: string,
  newStatus: string,
  actor: string,
  reason?: string,
  version: string = "0.1"
): Promise<BackupResult> {
  const backupManager = createPassportBackupManager(bucket, version);
  return backupManager.backupStatusChange(
    passport,
    previousStatus,
    newStatus,
    actor,
    reason
  );
}
