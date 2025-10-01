/**
 * Region Resolution and Binding Management
 *
 * This module handles tenant-to-region mapping and provides the correct
 * database bindings based on tenant configuration and compliance requirements.
 */

import { D1Database } from "@cloudflare/workers-types";
import { TenantRow } from "../adapters/ports";

// ============================================================================
// Types
// ============================================================================

export interface TenantBindings {
  d1: D1Database;
  kv: KVNamespace;
  r2: R2Bucket;
  region: string;
}

export interface RegionConfig {
  US: {
    d1: string;
    kv: string;
    r2: string;
  };
  EU: {
    d1: string;
    kv: string;
    r2: string;
  };
  CA: {
    d1: string;
    kv: string;
    r2: string;
  };
}

// ============================================================================
// Region Resolution
// ============================================================================

/**
 * Resolve tenant bindings based on tenant region and environment
 */
export function resolveTenantBindings(
  env: any,
  tenant: TenantRow
): TenantBindings {
  const region = tenant.region || env.DEFAULT_REGION || "US";

  switch (region.toUpperCase()) {
    case "EU":
      return {
        d1: env[env.D1_EU_BINDING || "D1_EU"],
        kv: env[env.KV_EU_BINDING || "KV_EU"],
        r2: env[env.R2_EU_BINDING || "R2_EU"],
        region: "EU",
      };

    case "CA":
      return {
        d1: env[env.D1_CA_BINDING || "D1_CA"],
        kv: env[env.KV_CA_BINDING || "KV_CA"],
        r2: env[env.R2_CA_BINDING || "R2_CA"],
        region: "CA",
      };

    case "US":
    default:
      return {
        d1: env[env.D1_US_BINDING || "D1_US"],
        kv: env[env.KV_US_BINDING || "KV_US"],
        r2: env[env.R2_US_BINDING || "R2_US"],
        region: "US",
      };
  }
}

/**
 * Get region-specific D1 binding name
 */
export function getD1BindingName(region: string): string {
  switch (region.toUpperCase()) {
    case "EU":
      return "D1_EU";
    case "CA":
      return "D1_CA";
    case "US":
    default:
      return "D1_US";
  }
}

/**
 * Get region-specific KV binding name
 */
export function getKVBindingName(region: string): string {
  switch (region.toUpperCase()) {
    case "EU":
      return "KV_EU";
    case "CA":
      return "KV_CA";
    case "US":
    default:
      return "KV_US";
  }
}

/**
 * Get region-specific R2 binding name
 */
export function getR2BindingName(region: string): string {
  switch (region.toUpperCase()) {
    case "EU":
      return "R2_EU";
    case "CA":
      return "R2_CA";
    case "US":
    default:
      return "R2_US";
  }
}

// ============================================================================
// Tenant Resolution
// ============================================================================

/**
 * Resolve tenant from organization ID
 * This would typically query the database to get tenant information
 */
export async function resolveTenantFromOrgId(
  env: any,
  orgId: string
): Promise<TenantRow> {
  // For now, return a default tenant
  // In production, this would query the database
  return {
    tenant_id: orgId,
    org_id: orgId,
    region: "US", // This would come from database
    db_kind: "shared",
    db_connection_string: undefined,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Resolve tenant bindings from organization ID
 */
export async function resolveBindingsFromOrgId(
  env: any,
  orgId: string
): Promise<TenantBindings> {
  const tenant = await resolveTenantFromOrgId(env, orgId);
  return resolveTenantBindings(env, tenant);
}

// ============================================================================
// Environment Validation
// ============================================================================

/**
 * Validate that all required region bindings are present
 */
export function validateRegionBindings(env: any): void {
  const requiredBindings = [
    "D1_US",
    "KV_US",
    "R2_US",
    "D1_EU",
    "KV_EU",
    "R2_EU",
    "D1_CA",
    "KV_CA",
    "R2_CA",
  ];

  const missing = requiredBindings.filter((binding) => !env[binding]);

  if (missing.length > 0) {
    throw new Error(`Missing required region bindings: ${missing.join(", ")}`);
  }
}

/**
 * Get available regions from environment
 */
export function getAvailableRegions(env: any): string[] {
  const regions = [];

  if (env.D1_US && env.KV_US && env.R2_US) {
    regions.push("US");
  }

  if (env.D1_EU && env.KV_EU && env.R2_EU) {
    regions.push("EU");
  }

  if (env.D1_CA && env.KV_CA && env.R2_CA) {
    regions.push("CA");
  }

  return regions;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a region is available
 */
export function isRegionAvailable(env: any, region: string): boolean {
  const availableRegions = getAvailableRegions(env);
  return availableRegions.includes(region.toUpperCase());
}

/**
 * Get the default region
 */
export function getDefaultRegion(env: any): string {
  return env.DEFAULT_REGION || "US";
}

/**
 * Create a region-aware database factory
 */
export async function createRegionAwareDbFactory(env: any, tenant: TenantRow) {
  const bindings = resolveTenantBindings(env, tenant);

  // Import the D1 factory dynamically
  const { createD1DbFactory } = await import("../adapters/d1");

  return createD1DbFactory({
    bindings: {
      [getD1BindingName(bindings.region)]: bindings.d1,
    },
    [getD1BindingName(bindings.region)]: bindings.d1,
    defaultRegion: bindings.region,
  });
}
