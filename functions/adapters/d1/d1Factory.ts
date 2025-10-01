/**
 * D1 Database Factory
 *
 * This module implements the DbFactory interface using D1 database with Drizzle ORM.
 * It provides tenant-aware database connections and transaction management.
 */

import { drizzle } from "drizzle-orm/d1";
import { D1Database } from "@cloudflare/workers-types";
import {
  createD1Client,
  createD1ClientManager,
  D1Client,
  D1ClientManager,
} from "./d1Client";
import {
  D1PassportRepo,
  D1DecisionLogRepo,
  D1PolicyRepo,
  D1OrgRepo,
  D1RefundRepo,
  D1IdempotencyRepo,
} from "./d1Repos";
import {
  DbFactory,
  Txn,
  TxCtx,
  TenantNotFoundError,
  RegionUnavailableError,
  TransactionError,
  ConcurrencyError,
} from "../ports";

// ============================================================================
// D1 Transaction Implementation
// ============================================================================

export class D1Transaction implements Txn {
  private active = true;
  private id = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  constructor(private db: ReturnType<typeof drizzle>, private orgId: string) {}

  async run<T>(fn: (ctx: TxCtx) => Promise<T>): Promise<T> {
    if (!this.active) {
      throw new TransactionError(
        "Transaction is not active",
        "TRANSACTION_INACTIVE"
      );
    }

    try {
      // Create repository context
      const ctx: TxCtx = {
        passports: new D1PassportRepo(this.db, this.orgId),
        decisions: new D1DecisionLogRepo(this.db, this.orgId),
        policies: new D1PolicyRepo(this.db, this.orgId),
        orgs: new D1OrgRepo(this.db),
        refunds: new D1RefundRepo(this.db, this.orgId),
        idempotency: new D1IdempotencyRepo(this.db, this.orgId),
      };

      // Execute function within transaction context
      // Note: D1 doesn't support explicit transactions, so we rely on
      // individual operation atomicity and optimistic concurrency
      const result = await fn(ctx);

      // Mark transaction as completed
      this.active = false;

      return result;
    } catch (error) {
      this.active = false;

      if (error instanceof ConcurrencyError) {
        throw error;
      }

      throw new TransactionError(
        `Transaction failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "TRANSACTION_FAILED",
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  isActive(): boolean {
    return this.active;
  }

  getId(): string {
    return this.id;
  }
}

// ============================================================================
// D1 Database Factory Implementation
// ============================================================================

export interface D1FactoryConfig {
  bindings: Record<string, D1Database>;
  defaultRegion?: string;
}

export class D1DbFactory implements DbFactory {
  private clientManager: D1ClientManager;
  private defaultRegion: string;

  constructor(config: D1FactoryConfig) {
    this.clientManager = createD1ClientManager({
      bindings: config.bindings,
      defaultRegion: config.defaultRegion || "US",
    });
    this.defaultRegion = config.defaultRegion || "US";
  }

  async forTenant(tenantId: string): Promise<{ tx: Txn; repos: TxCtx }> {
    try {
      // Get client for tenant (for now, use default region)
      const client = await this.clientManager.getClientForTenant(tenantId);

      // Create transaction
      const tx = new D1Transaction(client.db, tenantId);

      // Create repository context
      const repos: TxCtx = {
        passports: new D1PassportRepo(client.db, tenantId),
        decisions: new D1DecisionLogRepo(client.db, tenantId),
        policies: new D1PolicyRepo(client.db, tenantId),
        orgs: new D1OrgRepo(client.db),
        refunds: new D1RefundRepo(client.db, tenantId),
        idempotency: new D1IdempotencyRepo(client.db, tenantId),
      };

      return { tx, repos };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("No D1 binding found")
      ) {
        throw new RegionUnavailableError(this.defaultRegion);
      }
      throw new TenantNotFoundError(tenantId);
    }
  }

  async forRegion(region: string): Promise<{ tx: Txn; repos: TxCtx }> {
    try {
      const client = this.clientManager.getClient(region);

      // For region-level operations, we don't have a specific tenant
      const tx = new D1Transaction(client.db, "system");

      const repos: TxCtx = {
        passports: new D1PassportRepo(client.db, "system"),
        decisions: new D1DecisionLogRepo(client.db, "system"),
        policies: new D1PolicyRepo(client.db, "system"),
        orgs: new D1OrgRepo(client.db),
        refunds: new D1RefundRepo(client.db, "system"),
        idempotency: new D1IdempotencyRepo(client.db, "system"),
      };

      return { tx, repos };
    } catch (error) {
      throw new RegionUnavailableError(region);
    }
  }

  async forAdmin(): Promise<{ tx: Txn; repos: TxCtx }> {
    // Use default region for admin operations
    return this.forRegion(this.defaultRegion);
  }

  async isTenantAccessible(tenantId: string): Promise<boolean> {
    try {
      const { repos } = await this.forTenant(tenantId);
      return await repos.orgs.exists(tenantId);
    } catch (error) {
      return false;
    }
  }

  async getTenantRegion(tenantId: string): Promise<string | null> {
    try {
      const { repos } = await this.forTenant(tenantId);
      const tenant = await repos.orgs.getTenant(tenantId);
      return tenant?.region || null;
    } catch (error) {
      return null;
    }
  }

  async healthCheck(): Promise<
    Record<string, { status: "healthy" | "unhealthy"; latency?: number }>
  > {
    return this.clientManager.healthCheck();
  }
}

// ============================================================================
// Factory Creation Functions
// ============================================================================

/**
 * Create a D1 database factory
 */
export function createD1DbFactory(config: D1FactoryConfig): DbFactory {
  return new D1DbFactory(config);
}

/**
 * Create a D1 database factory from Cloudflare environment
 */
export function createD1DbFactoryFromEnv(env: {
  D1_US?: D1Database;
  D1_EU?: D1Database;
  D1_CA?: D1Database;
  DEFAULT_REGION?: string;
}): DbFactory {
  const bindings: Record<string, D1Database> = {};

  if (env.D1_US) bindings.US = env.D1_US;
  if (env.D1_EU) bindings.EU = env.D1_EU;
  if (env.D1_CA) bindings.CA = env.D1_CA;

  if (Object.keys(bindings).length === 0) {
    throw new Error("No D1 bindings found in environment");
  }

  return createD1DbFactory({
    bindings,
    defaultRegion: env.DEFAULT_REGION || "US",
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Initialize all D1 databases with tables and migrations
 */
export async function initializeAllD1Databases(
  factory: DbFactory,
  options: {
    createTables?: boolean;
    runMigrations?: boolean;
    seedData?: boolean;
  } = {}
): Promise<void> {
  const {
    createTables = true,
    runMigrations = false,
    seedData = false,
  } = options;

  // Get health check to see all available regions
  const health = await factory.healthCheck();
  const regions = Object.keys(health);

  // Initialize each region
  for (const region of regions) {
    try {
      const { tx } = await factory.forRegion(region);

      await tx.run(async (ctx) => {
        // Initialize database for this region
        // This would call the initialization functions from d1Client.ts
        console.log(`Initializing database for region: ${region}`);
      });
    } catch (error) {
      console.error(
        `Failed to initialize database for region ${region}:`,
        error
      );
    }
  }
}

/**
 * Get database statistics across all regions
 */
export async function getDatabaseStats(
  factory: DbFactory
): Promise<Record<string, any>> {
  const stats: Record<string, any> = {};

  try {
    const health = await factory.healthCheck();

    for (const [region, healthStatus] of Object.entries(health)) {
      if (healthStatus.status === "healthy") {
        try {
          const { tx } = await factory.forRegion(region);

          await tx.run(async (ctx) => {
            const passportCount = await ctx.passports.getCountByOrg("system");
            const orgCount = await ctx.orgs.listAll();

            stats[region] = {
              status: "healthy",
              latency: healthStatus.latency,
              passportCount,
              orgCount: orgCount.length,
            };
          });
        } catch (error) {
          stats[region] = {
            status: "unhealthy",
            error: error instanceof Error ? error.message : String(error),
          };
        }
      } else {
        stats[region] = healthStatus;
      }
    }
  } catch (error) {
    stats.error = error instanceof Error ? error.message : String(error);
  }

  return stats;
}
