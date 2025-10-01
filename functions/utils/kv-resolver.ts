/**
 * KV Resolver Utility
 *
 * Provides multi-region/multi-tenant KV resolution similar to D1 factory.
 * Resolves the appropriate KV binding based on tenant region.
 */

import { KVNamespace } from "@cloudflare/workers-types";
import {
  resolveTenantFromOrgId,
  resolveTenantBindings,
} from "../runtime/region";

// ============================================================================
// Types
// ============================================================================

export interface KVResolverConfig {
  defaultRegion?: string;
  fallbackKV?: KVNamespace;
}

export interface MultiRegionEnv {
  // Default KV (fallback)
  ai_passport_registry: KVNamespace;

  // Multi-region KV bindings
  KV_US?: KVNamespace;
  KV_EU?: KVNamespace;
  KV_CA?: KVNamespace;

  // Multi-region D1 bindings (for tenant resolution)
  D1_US?: D1Database;
  D1_EU?: D1Database;
  D1_CA?: D1Database;

  // Multi-region R2 bindings
  R2_US?: R2Bucket;
  R2_EU?: R2Bucket;
  R2_CA?: R2Bucket;

  // Configuration
  DEFAULT_REGION?: string;
}

// ============================================================================
// KV Resolver
// ============================================================================

/**
 * KV Resolver for multi-region/multi-tenant support
 */
export class KVResolver {
  private config: KVResolverConfig;
  private env: MultiRegionEnv;

  constructor(env: MultiRegionEnv, config: KVResolverConfig = {}) {
    this.env = env;
    this.config = {
      defaultRegion: "US",
      fallbackKV: env.ai_passport_registry,
      ...config,
    };
  }

  /**
   * Get the appropriate KV binding for a given owner ID
   * Resolves tenant and returns region-specific KV
   */
  async getKVForOwner(ownerId: string): Promise<KVNamespace> {
    try {
      // Resolve tenant information
      const tenant = await resolveTenantFromOrgId(this.env, ownerId);

      // Get region-specific bindings
      const bindings = resolveTenantBindings(this.env, tenant);

      return bindings.kv;
    } catch (error) {
      console.warn("Failed to resolve tenant KV, using fallback", {
        error: error instanceof Error ? error.message : String(error),
        ownerId,
      });

      return this.getDefaultKV();
    }
  }

  /**
   * Get the appropriate KV binding for a given region
   */
  getKVForRegion(region: string): KVNamespace {
    const normalizedRegion = region.toUpperCase();

    switch (normalizedRegion) {
      case "EU":
        return this.env.KV_EU || this.config.fallbackKV!;
      case "CA":
        return this.env.KV_CA || this.config.fallbackKV!;
      case "US":
      default:
        return this.env.KV_US || this.config.fallbackKV!;
    }
  }

  /**
   * Get the default KV binding
   */
  getDefaultKV(): KVNamespace {
    return this.config.fallbackKV!;
  }

  /**
   * Get all available KV bindings
   */
  getAllKVBindings(): Record<string, KVNamespace> {
    const bindings: Record<string, KVNamespace> = {};

    if (this.env.KV_US) bindings.US = this.env.KV_US;
    if (this.env.KV_EU) bindings.EU = this.env.KV_EU;
    if (this.env.KV_CA) bindings.CA = this.env.KV_CA;

    return bindings;
  }

  /**
   * Check if multi-region KV is available
   */
  isMultiRegionAvailable(): boolean {
    const bindings = this.getAllKVBindings();
    return Object.keys(bindings).length > 1;
  }

  /**
   * Get region information for a given owner ID
   */
  async getRegionForOwner(ownerId: string): Promise<string> {
    try {
      const tenant = await resolveTenantFromOrgId(this.env, ownerId);
      const bindings = resolveTenantBindings(this.env, tenant);
      return bindings.region;
    } catch (error) {
      console.warn("Failed to resolve tenant region, using default", {
        error: error instanceof Error ? error.message : String(error),
        ownerId,
      });
      return this.config.defaultRegion!;
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a KV resolver instance
 */
export function createKVResolver(
  env: MultiRegionEnv,
  config?: KVResolverConfig
): KVResolver {
  return new KVResolver(env, config);
}

/**
 * Get KV for owner with fallback
 * Convenience function for simple use cases
 */
export async function getKVForOwner(
  env: MultiRegionEnv,
  ownerId: string,
  config?: KVResolverConfig
): Promise<KVNamespace> {
  const resolver = createKVResolver(env, config);
  return await resolver.getKVForOwner(ownerId);
}

/**
 * Get KV for region with fallback
 * Convenience function for simple use cases
 */
export function getKVForRegion(
  env: MultiRegionEnv,
  region: string,
  config?: KVResolverConfig
): KVNamespace {
  const resolver = createKVResolver(env, config);
  return resolver.getKVForRegion(region);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if environment has multi-region KV support
 */
export function hasMultiRegionKV(env: MultiRegionEnv): boolean {
  const resolver = createKVResolver(env);
  return resolver.isMultiRegionAvailable();
}

/**
 * Get all available regions
 */
export function getAvailableRegions(env: MultiRegionEnv): string[] {
  const resolver = createKVResolver(env);
  return Object.keys(resolver.getAllKVBindings());
}

/**
 * Validate multi-region KV configuration
 */
export function validateMultiRegionKV(env: MultiRegionEnv): {
  isValid: boolean;
  missing: string[];
  available: string[];
} {
  const requiredBindings = ["KV_US", "KV_EU", "KV_CA"];
  const missing = requiredBindings.filter(
    (binding) => !env[binding as keyof MultiRegionEnv]
  );
  const available = getAvailableRegions(env);

  return {
    isValid: missing.length === 0,
    missing,
    available,
  };
}
