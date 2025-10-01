/**
 * Database Factory Resolver
 *
 * This module provides database-agnostic factory creation based on tenant configuration.
 * It maintains D1 as the default while allowing future MySQL/PostgreSQL support.
 *
 * Security: Database credentials are stored in environment variables (Cloudflare Workers secrets),
 * not in the database. Only database type and connection identifiers are stored in TenantRow.
 */

import { DbFactory } from "../adapters/ports";
import { createD1DbFactoryFromEnv } from "../adapters/d1";
import { resolveTenantBindings, getD1BindingName } from "./region";
import { TenantRow } from "../adapters/ports";

// ============================================================================
// Database Factory Resolver
// ============================================================================

/**
 * Create a database factory based on tenant configuration
 *
 * @param env Environment variables (contains database credentials)
 * @param tenant Tenant configuration (contains database type preference)
 * @returns Database factory instance
 */
export function createDatabaseFactory(env: any, tenant: TenantRow): DbFactory {
  // Get tenant's database type preference, default to D1
  const dbType = tenant.db_type || env.DEFAULT_DB_TYPE || "d1";
  const bindings = resolveTenantBindings(env, tenant);

  switch (dbType) {
    case "mysql":
      // TODO: Implement MySQL factory when needed
      throw new Error(
        "MySQL database support not yet implemented. Please use D1 for now."
      );

    case "postgresql":
      // TODO: Implement PostgreSQL factory when needed
      throw new Error(
        "PostgreSQL database support not yet implemented. Please use D1 for now."
      );

    case "d1":
    default:
      // Default to D1 (current implementation)
      return createD1DbFactoryFromEnv({
        [getD1BindingName(bindings.region)]: bindings.d1,
        DEFAULT_REGION: bindings.region,
      });
  }
}

/**
 * Create a database factory for private instances
 *
 * @param env Environment variables
 * @param tenant Tenant configuration with private connection details
 * @returns Database factory instance for private database
 */
export function createPrivateDatabaseFactory(
  env: any,
  tenant: TenantRow
): DbFactory {
  if (tenant.db_kind !== "private" || !tenant.db_connection_string) {
    throw new Error(
      "Private database configuration requires db_kind='private' and db_connection_string"
    );
  }

  const dbType = tenant.db_type || "postgresql"; // Default private DBs to PostgreSQL
  const region = tenant.region || env.DEFAULT_REGION || "US";

  // Parse connection string (format: "postgresql://user:pass@host:port/db" or "mysql://user:pass@host:port/db")
  const connectionUrl = new URL(tenant.db_connection_string);

  switch (dbType) {
    case "mysql":
      // TODO: Implement MySQL private instance support when needed
      throw new Error(
        "MySQL private instance support not yet implemented. Please use D1 for now."
      );

    case "postgresql":
      // TODO: Implement PostgreSQL private instance support when needed
      throw new Error(
        "PostgreSQL private instance support not yet implemented. Please use D1 for now."
      );

    default:
      throw new Error(`Unsupported private database type: ${dbType}`);
  }
}

/**
 * Create the appropriate database factory based on tenant configuration
 *
 * @param env Environment variables
 * @param tenant Tenant configuration
 * @returns Database factory instance
 */
export function createTenantDatabaseFactory(
  env: any,
  tenant: TenantRow
): DbFactory {
  // For private instances, use connection string
  if (tenant.db_kind === "private") {
    return createPrivateDatabaseFactory(env, tenant);
  }

  // For shared instances, use environment variables
  return createDatabaseFactory(env, tenant);
}

// ============================================================================
// Environment Variable Validation
// ============================================================================

/**
 * Validate that required environment variables are present for a database type
 *
 * @param env Environment variables
 * @param dbType Database type
 * @param region Region
 * @returns True if all required variables are present
 */
export function validateDatabaseEnvironment(
  env: any,
  dbType: string,
  region: string
): boolean {
  const regionUpper = region.toUpperCase();

  switch (dbType) {
    case "mysql":
      return !!(
        env[`MYSQL_${regionUpper}_HOST`] &&
        env[`MYSQL_${regionUpper}_DATABASE`] &&
        env[`MYSQL_${regionUpper}_USERNAME`] &&
        env[`MYSQL_${regionUpper}_PASSWORD`]
      );

    case "postgresql":
      return !!(
        env[`PG_${regionUpper}_HOST`] &&
        env[`PG_${regionUpper}_DATABASE`] &&
        env[`PG_${regionUpper}_USERNAME`] &&
        env[`PG_${regionUpper}_PASSWORD`]
      );

    case "d1":
      return !!(env[`D1_${regionUpper}`] || env[`D1_${regionUpper}_BINDING`]);

    default:
      return false;
  }
}

/**
 * Get available database types for a region based on environment configuration
 *
 * @param env Environment variables
 * @param region Region
 * @returns Array of available database types
 */
export function getAvailableDatabaseTypes(env: any, region: string): string[] {
  const available: string[] = [];

  // D1 is always available (default)
  if (validateDatabaseEnvironment(env, "d1", region)) {
    available.push("d1");
  }

  // Check MySQL
  if (validateDatabaseEnvironment(env, "mysql", region)) {
    available.push("mysql");
  }

  // Check PostgreSQL
  if (validateDatabaseEnvironment(env, "postgresql", region)) {
    available.push("postgresql");
  }

  return available;
}
