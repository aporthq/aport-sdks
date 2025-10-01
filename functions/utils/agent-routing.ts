/**
 * Agent Routing Utilities
 *
 * Handles agent ID generation and KV mapping for multi-region/multi-tenant routing.
 * Uses UUID v4 for agent IDs and maintains agent_info KV mapping for fast routing.
 */

import { KVNamespace, D1Database } from "@cloudflare/workers-types";

// ============================================================================
// Types
// ============================================================================

export interface AgentInfo {
  owner_id: string;
  region: string;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface AgentRoutingConfig {
  kv: KVNamespace;
  region: string;
}

export interface FallbackConfig {
  defaultKV: KVNamespace;
  defaultD1: D1Database;
  defaultRegion: string;
}

// ============================================================================
// Agent ID Generation
// ============================================================================

/**
 * Generate a random UUID v4 for agent ID
 * This is the recommended approach for multi-region/multi-tenant systems
 */
export function generateAgentId(): string {
  // Generate UUID v4 using crypto.getRandomValues
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);

  // Set version (4) and variant bits
  array[6] = (array[6] & 0x0f) | 0x40; // Version 4
  array[8] = (array[8] & 0x3f) | 0x80; // Variant bits

  // Convert to hex string with dashes
  const hex = Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32),
  ].join("-");
}

/**
 * Generate a time-ordered UUID v7 for agent ID (optional)
 * Better for database locality but more complex
 */
export function generateAgentIdV7(): string {
  // For now, use v4. v7 implementation would require more complex logic
  // involving timestamp and random components
  return generateAgentId();
}

// ============================================================================
// KV Mapping Management
// ============================================================================

/**
 * Write agent routing information to KV
 * This is the key routing mechanism for multi-region/multi-tenant support
 */
export async function writeAgentRouting(
  kv: KVNamespace,
  agentId: string,
  ownerId: string,
  region: string,
  version: number = 1
): Promise<void> {
  const agentInfo: AgentInfo = {
    owner_id: ownerId,
    region: region,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: version,
  };

  const key = `agent_info:${agentId}`;
  await kv.put(key, JSON.stringify(agentInfo));
}

/**
 * Read agent routing information from KV
 * This is the primary routing mechanism for verify endpoints
 */
export async function readAgentRouting(
  kv: KVNamespace,
  agentId: string
): Promise<AgentInfo | null> {
  const key = `agent_info:${agentId}`;
  const value = await kv.get(key, "json");

  if (!value) {
    return null;
  }

  // Validate the structure
  if (
    typeof value === "object" &&
    value !== null &&
    "owner_id" in value &&
    "region" in value &&
    typeof (value as any).owner_id === "string" &&
    typeof (value as any).region === "string"
  ) {
    return value as AgentInfo;
  }

  return null;
}

/**
 * Update agent routing information in KV
 * Used when owner or region changes
 */
export async function updateAgentRouting(
  kv: KVNamespace,
  agentId: string,
  ownerId: string,
  region: string,
  currentVersion: number
): Promise<void> {
  const agentInfo: AgentInfo = {
    owner_id: ownerId,
    region: region,
    created_at: new Date().toISOString(), // Keep original creation time
    updated_at: new Date().toISOString(),
    version: currentVersion + 1,
  };

  const key = `agent_info:${agentId}`;
  await kv.put(key, JSON.stringify(agentInfo));
}

/**
 * Delete agent routing information from KV
 * Used for hard deletes (rare, usually keep for audit)
 */
export async function deleteAgentRouting(
  kv: KVNamespace,
  agentId: string
): Promise<void> {
  const key = `agent_info:${agentId}`;
  await kv.delete(key);
}

// ============================================================================
// Local Caching
// ============================================================================

/**
 * Simple in-memory LRU cache for agent routing info
 * Reduces KV reads for frequently accessed agents
 */
class AgentRoutingCache {
  private cache = new Map<string, { data: AgentInfo; expires: number }>();
  private maxSize = 1000;
  private ttl = 60000; // 60 seconds

  get(agentId: string): AgentInfo | null {
    const entry = this.cache.get(agentId);
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expires) {
      this.cache.delete(agentId);
      return null;
    }

    return entry.data;
  }

  set(agentId: string, data: AgentInfo): void {
    // Remove oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(agentId, {
      data,
      expires: Date.now() + this.ttl,
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

// Global cache instance
const agentRoutingCache = new AgentRoutingCache();

/**
 * Get agent routing info with local caching and fallback
 * First checks local cache, then KV mapping, then falls back to passport data
 */
export async function getAgentRouting(
  kv: KVNamespace,
  agentId: string,
  fallbackConfig?: FallbackConfig
): Promise<AgentInfo | null> {
  // Check local cache first
  const cached = agentRoutingCache.get(agentId);
  if (cached) {
    return cached;
  }

  // Read from KV mapping
  const agentInfo = await readAgentRouting(kv, agentId);
  if (agentInfo) {
    // Cache the result
    agentRoutingCache.set(agentId, agentInfo);
    return agentInfo;
  }

  // Fallback: try to get routing info from passport data
  if (fallbackConfig) {
    const fallbackInfo = await getAgentRoutingFromFallback(
      agentId,
      fallbackConfig
    );
    if (fallbackInfo) {
      // Cache the fallback result
      agentRoutingCache.set(agentId, fallbackInfo);
      return fallbackInfo;
    }
  }

  return null;
}

/**
 * Fallback method to get agent routing info from passport data
 * Tries KV first, then D1 if KV fails
 */
async function getAgentRoutingFromFallback(
  agentId: string,
  fallbackConfig: FallbackConfig
): Promise<AgentInfo | null> {
  try {
    // Try to get passport data from default KV
    const passportKey = `passport:${agentId}`;
    const passportData = await fallbackConfig.defaultKV.get(
      passportKey,
      "json"
    );

    if (passportData && typeof passportData === "object") {
      const passport = passportData as any;
      if (passport.owner_id) {
        // Create agent info from passport data
        const agentInfo: AgentInfo = {
          owner_id: passport.owner_id,
          region: fallbackConfig.defaultRegion,
          created_at: passport.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          version: 1,
        };

        // Write the mapping back to KV for future fast lookups
        try {
          await writeAgentRouting(
            fallbackConfig.defaultKV,
            agentId,
            passport.owner_id,
            fallbackConfig.defaultRegion,
            1
          );
        } catch (error) {
          console.warn(
            "Failed to write agent routing mapping during fallback",
            {
              error: error instanceof Error ? error.message : String(error),
              agentId,
            }
          );
        }

        return agentInfo;
      }
    }
  } catch (error) {
    console.warn("Failed to get passport data from KV during fallback", {
      error: error instanceof Error ? error.message : String(error),
      agentId,
    });
  }

  // If KV fallback failed, try D1
  try {
    const result = (await fallbackConfig.defaultD1
      .prepare("SELECT owner_id, created_at FROM passports WHERE agent_id = ?")
      .bind(agentId)
      .first()) as any;

    if (result && result.owner_id) {
      // Create agent info from D1 data
      const agentInfo: AgentInfo = {
        owner_id: result.owner_id as string,
        region: fallbackConfig.defaultRegion,
        created_at: (result.created_at as string) || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 1,
      };

      // Write the mapping back to KV for future fast lookups
      try {
        await writeAgentRouting(
          fallbackConfig.defaultKV,
          agentId,
          result.owner_id as string,
          fallbackConfig.defaultRegion,
          1
        );
      } catch (error) {
        console.warn(
          "Failed to write agent routing mapping during D1 fallback",
          {
            error: error instanceof Error ? error.message : String(error),
            agentId,
          }
        );
      }

      return agentInfo;
    }
  } catch (error) {
    console.warn("Failed to get passport data from D1 during fallback", {
      error: error instanceof Error ? error.message : String(error),
      agentId,
    });
  }

  return null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create fallback configuration from environment
 * Provides default KV and D1 for fallback scenarios
 */
export function createFallbackConfig(env: any): FallbackConfig {
  return {
    defaultKV: env.ai_passport_registry,
    defaultD1: env.D1_US || env.ai_passport_registry,
    defaultRegion: env.DEFAULT_REGION || "US",
  };
}

/**
 * Get agent routing with automatic fallback
 * Uses environment to create fallback config automatically
 */
export async function getAgentRoutingWithFallback(
  kv: KVNamespace,
  agentId: string,
  env: any
): Promise<AgentInfo | null> {
  const fallbackConfig = createFallbackConfig(env);
  return await getAgentRouting(kv, agentId, fallbackConfig);
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Create error response for missing agent routing
 */
export function createAgentNotIndexedError(agentId: string): Response {
  return new Response(
    JSON.stringify({
      error: "agent_not_indexed",
      message: `Agent ${agentId} is not indexed for routing. Please contact support.`,
      code: "AGENT_NOT_INDEXED",
      agent_id: agentId,
    }),
    {
      status: 403,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

/**
 * Create error response for agent routing failure
 */
export function createAgentRoutingError(
  agentId: string,
  reason: string
): Response {
  return new Response(
    JSON.stringify({
      error: "agent_routing_failed",
      message: `Failed to route agent ${agentId}: ${reason}`,
      code: "AGENT_ROUTING_FAILED",
      agent_id: agentId,
    }),
    {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

// ============================================================================
// Migration Utilities
// ============================================================================

/**
 * Backfill agent routing for existing agents
 * This is a one-time migration utility
 */
export async function backfillAgentRouting(
  kv: KVNamespace,
  agents: Array<{ agent_id: string; owner_id: string; region: string }>
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const agent of agents) {
    try {
      await writeAgentRouting(kv, agent.agent_id, agent.owner_id, agent.region);
      success++;
    } catch (error) {
      console.error(`Failed to backfill agent ${agent.agent_id}:`, error);
      failed++;
    }
  }

  return { success, failed };
}
