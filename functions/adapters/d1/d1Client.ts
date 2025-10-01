/**
 * D1 Client with Drizzle ORM
 *
 * This module provides a D1 database client using Drizzle ORM for type-safe
 * database operations. It supports multi-region and tenant-specific bindings.
 */

import { drizzle } from "drizzle-orm/d1";
import { D1Database } from "@cloudflare/workers-types";
import * as schema from "../../schema/drizzle.schema";

// ============================================================================
// D1 Client Factory
// ============================================================================

export interface D1ClientConfig {
  binding: D1Database;
  region?: string;
  tenantId?: string;
}

export interface D1Client {
  db: ReturnType<typeof drizzle>;
  binding: D1Database;
  region: string;
  tenantId?: string;
}

/**
 * Create a D1 client with Drizzle ORM
 */
export function createD1Client(config: D1ClientConfig): D1Client {
  const { binding, region = "US", tenantId } = config;

  const db = drizzle(binding, { schema });

  return {
    db,
    binding,
    region,
    tenantId,
  };
}

// ============================================================================
// Multi-Region D1 Client Manager
// ============================================================================

export interface D1ClientManager {
  getClient(region: string, tenantId?: string): D1Client;
  getClientForTenant(tenantId: string): Promise<D1Client>;
  getAllClients(): D1Client[];
  healthCheck(): Promise<
    Record<string, { status: "healthy" | "unhealthy"; latency?: number }>
  >;
}

export interface D1ClientManagerConfig {
  bindings: Record<string, D1Database>;
  defaultRegion?: string;
}

/**
 * Create a multi-region D1 client manager
 */
export function createD1ClientManager(
  config: D1ClientManagerConfig
): D1ClientManager {
  const { bindings, defaultRegion = "US" } = config;

  const clients: Map<string, D1Client> = new Map();

  // Initialize clients for all regions
  for (const [region, binding] of Object.entries(bindings)) {
    const client = createD1Client({ binding, region });
    clients.set(region, client);
  }

  return {
    getClient(region: string, tenantId?: string): D1Client {
      const client = clients.get(region);
      if (!client) {
        throw new Error(`No D1 binding found for region: ${region}`);
      }
      return { ...client, tenantId };
    },

    async getClientForTenant(tenantId: string): Promise<D1Client> {
      // For now, we'll use the default region
      // In the future, this will look up the tenant's region from the database
      return this.getClient(defaultRegion, tenantId);
    },

    getAllClients(): D1Client[] {
      return Array.from(clients.values());
    },

    async healthCheck(): Promise<
      Record<string, { status: "healthy" | "unhealthy"; latency?: number }>
    > {
      const results: Record<
        string,
        { status: "healthy" | "unhealthy"; latency?: number }
      > = {};

      for (const [region, client] of clients) {
        try {
          const start = Date.now();
          // Simple health check query
          await client.db.select().from(schema.organizations).limit(1);
          const latency = Date.now() - start;

          results[region] = { status: "healthy", latency };
        } catch (error) {
          console.error(`Health check failed for region ${region}:`, error);
          results[region] = { status: "unhealthy" };
        }
      }

      return results;
    },
  };
}

// ============================================================================
// Database Initialization
// ============================================================================

export interface DatabaseInitOptions {
  createTables?: boolean;
  runMigrations?: boolean;
  seedData?: boolean;
}

/**
 * Initialize database with tables and migrations
 */
export async function initializeDatabase(
  client: D1Client,
  options: DatabaseInitOptions = {}
): Promise<void> {
  const {
    createTables = true,
    runMigrations = false,
    seedData = false,
  } = options;

  if (createTables) {
    await createTablesIfNotExists(client);
  }

  if (runMigrations) {
    await runPendingMigrations(client);
  }

  if (seedData) {
    await seedInitialData(client);
  }
}

/**
 * Create tables if they don't exist
 */
async function createTablesIfNotExists(client: D1Client): Promise<void> {
  const { binding } = client;

  // Create organizations table
  await binding.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      org_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT,
      contact_email TEXT NOT NULL,
      assurance_level TEXT NOT NULL,
      assurance_method TEXT,
      assurance_verified_at TEXT,
      can_issue_for_others INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      org_key_id TEXT,
      org_key_hash TEXT,
      region TEXT NOT NULL DEFAULT 'US',
      db_kind TEXT NOT NULL DEFAULT 'shared' CHECK (db_kind IN ('shared', 'private')),
      db_connection_string TEXT
    );
  `);

  // Create tenants table
  await binding.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      tenant_id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      region TEXT NOT NULL DEFAULT 'US',
      db_kind TEXT NOT NULL DEFAULT 'shared' CHECK (db_kind IN ('shared', 'private')),
      db_connection_string TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Create passports table
  await binding.exec(`
    CREATE TABLE IF NOT EXISTS passports (
      agent_id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      owner_type TEXT NOT NULL CHECK (owner_type IN ('org', 'user')),
      owner_display TEXT NOT NULL,
      controller_type TEXT NOT NULL CHECK (controller_type IN ('org', 'person', 'api', 'user')),
      claimed INTEGER NOT NULL DEFAULT 0,
      role TEXT NOT NULL,
      description TEXT NOT NULL,
      capabilities TEXT NOT NULL DEFAULT '[]',
      limits TEXT NOT NULL DEFAULT '{}',
      regions TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'suspended', 'revoked')),
      verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'email_verified', 'github_verified')),
      verification_method TEXT,
      verification_evidence TEXT,
      assurance_level TEXT NOT NULL,
      assurance_method TEXT,
      assurance_verified_at TEXT,
      contact TEXT NOT NULL,
      links TEXT NOT NULL DEFAULT '{}',
      categories TEXT,
      framework TEXT,
      logo_url TEXT,
      source TEXT NOT NULL CHECK (source IN ('admin', 'form', 'crawler')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      version TEXT NOT NULL,
      model_info TEXT,
      issuer_type TEXT CHECK (issuer_type IN ('user', 'org')),
      issued_by TEXT,
      provisioned_by_org_id TEXT,
      pending_owner TEXT,
      sponsor_orgs TEXT,
      registry_key_id TEXT,
      registry_sig TEXT,
      canonical_hash TEXT,
      verified_at TEXT,
      kind TEXT CHECK (kind IN ('template', 'instance')),
      parent_agent_id TEXT,
      platform_id TEXT,
      controller_id TEXT,
      tenant_ref TEXT,
      mcp TEXT,
      evaluation TEXT,
      attestations TEXT,
      version_number INTEGER NOT NULL DEFAULT 1
    );
  `);

  // Create policies table
  await binding.exec(`
    CREATE TABLE IF NOT EXISTS policies (
      policy_id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      pack_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      rules TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    );
  `);

  // Create decision_events table
  await binding.exec(`
    CREATE TABLE IF NOT EXISTS decision_events (
      decision_id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      policy_pack_id TEXT NOT NULL,
      decision TEXT NOT NULL CHECK (decision IN ('allow', 'deny')),
      reason TEXT NOT NULL,
      context TEXT NOT NULL,
      created_at TEXT NOT NULL,
      prev_hash TEXT,
      record_hash TEXT NOT NULL,
      expires_at TEXT
    );
  `);

  // Create refund_counters table
  await binding.exec(`
    CREATE TABLE IF NOT EXISTS refund_counters (
      counter_id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      currency TEXT NOT NULL,
      date_utc TEXT NOT NULL,
      amount_minor INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(org_id, agent_id, currency, date_utc)
    );
  `);

  // Create idempotency_keys table
  await binding.exec(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      idempotency_key TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      result TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);

  // Create migrations table
  await binding.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      checksum TEXT NOT NULL
    );
  `);

  // Create indexes
  await createIndexes(binding);
}

/**
 * Create database indexes
 */
async function createIndexes(binding: D1Database): Promise<void> {
  const indexes = [
    // Passports indexes
    "CREATE INDEX IF NOT EXISTS passports_owner_id_idx ON passports(owner_id)",
    "CREATE INDEX IF NOT EXISTS passports_slug_idx ON passports(slug)",
    "CREATE INDEX IF NOT EXISTS passports_status_idx ON passports(status)",
    "CREATE INDEX IF NOT EXISTS passports_kind_idx ON passports(kind)",
    "CREATE INDEX IF NOT EXISTS passports_parent_agent_idx ON passports(parent_agent_id)",
    "CREATE INDEX IF NOT EXISTS passports_platform_tenant_idx ON passports(platform_id, tenant_ref)",
    "CREATE UNIQUE INDEX IF NOT EXISTS passports_owner_slug_unique ON passports(owner_id, slug)",

    // Organizations indexes
    "CREATE INDEX IF NOT EXISTS organizations_region_idx ON organizations(region)",
    "CREATE INDEX IF NOT EXISTS organizations_status_idx ON organizations(status)",
    "CREATE INDEX IF NOT EXISTS organizations_domain_idx ON organizations(domain)",

    // Tenants indexes
    "CREATE INDEX IF NOT EXISTS tenants_org_id_idx ON tenants(org_id)",
    "CREATE INDEX IF NOT EXISTS tenants_region_idx ON tenants(region)",

    // Policies indexes
    "CREATE INDEX IF NOT EXISTS policies_org_id_idx ON policies(org_id)",
    "CREATE INDEX IF NOT EXISTS policies_pack_id_idx ON policies(pack_id)",
    "CREATE INDEX IF NOT EXISTS policies_active_idx ON policies(is_active)",
    "CREATE INDEX IF NOT EXISTS policies_org_pack_active_idx ON policies(org_id, pack_id, is_active)",

    // Decision events indexes
    "CREATE INDEX IF NOT EXISTS decision_events_org_id_idx ON decision_events(org_id)",
    "CREATE INDEX IF NOT EXISTS decision_events_agent_id_idx ON decision_events(agent_id)",
    "CREATE INDEX IF NOT EXISTS decision_events_pack_id_idx ON decision_events(policy_pack_id)",
    "CREATE INDEX IF NOT EXISTS decision_events_created_at_idx ON decision_events(created_at)",
    "CREATE INDEX IF NOT EXISTS decision_events_org_agent_idx ON decision_events(org_id, agent_id)",

    // Refund counters indexes
    "CREATE INDEX IF NOT EXISTS refund_counters_org_agent_idx ON refund_counters(org_id, agent_id)",
    "CREATE INDEX IF NOT EXISTS refund_counters_currency_date_idx ON refund_counters(currency, date_utc)",

    // Idempotency keys indexes
    "CREATE INDEX IF NOT EXISTS idempotency_org_agent_idx ON idempotency_keys(org_id, agent_id)",
    "CREATE INDEX IF NOT EXISTS idempotency_expires_at_idx ON idempotency_keys(expires_at)",
  ];

  for (const indexSql of indexes) {
    await binding.exec(indexSql);
  }
}

/**
 * Run pending migrations
 */
async function runPendingMigrations(client: D1Client): Promise<void> {
  // TODO: Implement migration system
  console.log("Migration system not yet implemented");
}

/**
 * Seed initial data
 */
async function seedInitialData(client: D1Client): Promise<void> {
  // TODO: Implement seed data
  console.log("Seed data not yet implemented");
}
