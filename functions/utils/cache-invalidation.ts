/**
 * Cache Invalidation Utilities
 * Handles proactive cache invalidation for passport updates
 */

import { KVNamespace } from "@cloudflare/workers-types";
import { invalidatePassportFromMemory } from "./memory-cache";
import {
  invalidatePassportFromEdge,
  invalidateOwnerPassportsFromEdge,
} from "./edge-cache";

/**
 * Invalidate passport from all cache tiers
 * Used when passport is updated, suspended, or revoked
 */
export async function invalidatePassportCache(
  agentId: string,
  ownerId?: string
): Promise<void> {
  try {
    // L1: Memory cache (immediate)
    invalidatePassportFromMemory(agentId);

    // L2: Edge cache (immediate)
    await invalidatePassportFromEdge(agentId);

    // If ownerId provided, also invalidate all owner's passports
    if (ownerId) {
      await invalidateOwnerPassportsFromEdge(ownerId);
    }

    console.log(
      `Invalidated passport cache for ${agentId}${
        ownerId ? ` and owner ${ownerId}` : ""
      }`
    );
  } catch (error) {
    console.error(`Failed to invalidate passport cache for ${agentId}:`, error);
  }
}

/**
 * Invalidate multiple passports atomically
 */
export async function invalidateMultiplePassportCaches(
  agentIds: string[],
  ownerId?: string
): Promise<void> {
  try {
    // Invalidate all passports in parallel
    const invalidationPromises = agentIds.map((agentId) =>
      invalidatePassportCache(agentId, ownerId)
    );

    await Promise.all(invalidationPromises);

    console.log(`Invalidated cache for ${agentIds.length} passports`);
  } catch (error) {
    console.error(`Failed to invalidate multiple passport caches:`, error);
  }
}

/**
 * Invalidate all passports for an owner
 * Used when owner data changes
 */
export async function invalidateOwnerCache(ownerId: string): Promise<void> {
  try {
    await invalidateOwnerPassportsFromEdge(ownerId);
    console.log(`Invalidated all passports for owner ${ownerId}`);
  } catch (error) {
    console.error(`Failed to invalidate owner cache for ${ownerId}:`, error);
  }
}
