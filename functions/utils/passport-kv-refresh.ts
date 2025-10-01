/**
 * KV refresh utilities for passport endpoints
 * Handles async KV refresh using waitUntil for better performance
 * Supports multi-tenant and multi-region architecture
 */

import { purgeVerifyCache } from "./cache-purge";
import { preSerializePassport } from "./serialization";
import { PassportData } from "../../types/passport";

export interface KVRefreshOptions {
  agentId: string;
  passportData: PassportData;
  kv: KVNamespace; // Pre-resolved KV binding
  env: any;
  ctx: any; // ExecutionContext for waitUntil
}

/**
 * Schedule KV refresh using waitUntil
 * This ensures the verify cache is updated within 60 seconds
 */
export function scheduleKVRefresh(options: KVRefreshOptions): void {
  const { agentId, passportData, kv, env, ctx } = options;

  // Use waitUntil to refresh KV asynchronously (if ctx is available)
  if (ctx && ctx.waitUntil) {
    ctx.waitUntil(
      refreshPassportKV(agentId, passportData, kv, env).catch((error) => {
        console.error(`Failed to refresh KV for passport ${agentId}:`);
      })
    );
  } else {
    // Fallback: run synchronously if no ctx available
    refreshPassportKV(agentId, passportData, kv, env).catch((error) => {
      console.error(`Failed to refresh KV for passport ${agentId}:`);
    });
  }
}

/**
 * Refresh passport data in KV storage using pre-resolved bindings
 */
async function refreshPassportKV(
  agentId: string,
  passportData: PassportData,
  kv: KVNamespace,
  env: any
): Promise<void> {
  try {
    // Pre-serialize passport for verify endpoint
    const serializedPassport = await preSerializePassport(
      kv,
      agentId,
      passportData,
      env.AP_VERSION || "1.0.0"
    );

    // Store in tenant-specific KV
    await kv.put(`passport:${agentId}`, JSON.stringify(serializedPassport), {
      expirationTtl: 86400, // 24 hours
    });

    // Purge Cloudflare edge cache
    await purgeVerifyCache(
      agentId,
      env.APP_BASE_URL || "https://aport.io",
      env.CLOUDFLARE_API_TOKEN,
      env.CLOUDFLARE_ZONE_ID
    );

    console.log(`Successfully refreshed KV for passport ${agentId}`);
  } catch (error) {
    console.error(`Error refreshing KV for passport ${agentId}:`, error);
    throw error;
  }
}

/**
 * Schedule R2 backup using waitUntil with pre-resolved bindings
 */
export function scheduleR2Backup(
  agentId: string,
  passportData: PassportData,
  env: any,
  ctx: any,
  region: string = "US",
  r2Bucket: R2Bucket | null = null
): void {
  // Use waitUntil to backup to R2 asynchronously (if ctx is available)
  if (ctx && ctx.waitUntil) {
    ctx.waitUntil(
      backupPassportToR2(agentId, passportData, r2Bucket, region, env).catch(
        (error) => {
          console.error(`Failed to backup passport ${agentId} to R2:`, error);
        }
      )
    );
  } else {
    // Fallback: run synchronously if no ctx available
    backupPassportToR2(agentId, passportData, r2Bucket, region, env).catch(
      (error) => {
        console.error(`Failed to backup passport ${agentId} to R2:`, error);
      }
    );
  }
}

/**
 * Backup passport data to R2 using pre-resolved bindings
 */
async function backupPassportToR2(
  agentId: string,
  passportData: PassportData,
  r2Bucket: R2Bucket | null,
  region: string | null = "US",
  env: any
): Promise<void> {
  try {
    if (!r2Bucket) {
      console.warn("R2 bucket not configured, skipping backup");
      return;
    }

    r2Bucket = r2Bucket || env.APORT_R2;

    const backupKey = `passports/${region}/${agentId}/${Date.now()}.json`;
    await r2Bucket.put(backupKey, JSON.stringify(passportData, null, 2));

    console.log(
      `Successfully backed up passport ${agentId} to R2 in region ${region}`
    );
  } catch (error) {
    console.error(`Error backing up passport ${agentId} to R2:`, error);
    throw error;
  }
}
