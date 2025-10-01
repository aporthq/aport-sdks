/**
 * PostgreSQL Database Factory
 *
 * This module implements the DbFactory interface using PostgreSQL database.
 * It provides tenant-aware database connections and transaction management.
 * Currently contains stub implementations that can be completed when needed.
 */

import {
  DbFactory,
  Txn,
  TxCtx,
  TenantNotFoundError,
  RegionUnavailableError,
  TransactionError,
  ConcurrencyError,
} from "../ports";
import {
  createPostgreSQLClient,
  createPostgreSQLClientManager,
  PostgreSQLClient,
  PostgreSQLClientManager,
  PostgreSQLClientConfig,
} from "./postgresqlClient";
import {
  PostgreSQLPassportRepo,
  PostgreSQLDecisionLogRepo,
  PostgreSQLPolicyRepo,
  PostgreSQLOrgRepo,
  PostgreSQLRefundRepo,
  PostgreSQLIdempotencyRepo,
} from "./postgresqlRepos";

// ============================================================================
// PostgreSQL Transaction Implementation
// ============================================================================

export class PostgreSQLTransaction implements Txn {
  private active = true;
  private id = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  constructor(private client: PostgreSQLClient, private orgId: string) {}

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
        passports: new PostgreSQLPassportRepo(
          this.client.connection,
          this.orgId
        ),
        decisions: new PostgreSQLDecisionLogRepo(
          this.client.connection,
          this.orgId
        ),
        policies: new PostgreSQLPolicyRepo(this.client.connection, this.orgId),
        orgs: new PostgreSQLOrgRepo(this.client.connection, this.orgId),
        refunds: new PostgreSQLRefundRepo(this.client.connection, this.orgId),
        idempotency: new PostgreSQLIdempotencyRepo(
          this.client.connection,
          this.orgId
        ),
      };

      // TODO: Implement PostgreSQL transaction handling
      // This would use PostgreSQL's transaction support
      throw new Error("PostgreSQLTransaction.run() not implemented yet");
    } catch (error) {
      this.active = false;
      throw new TransactionError(
        `Transaction failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "TRANSACTION_FAILED",
        error instanceof Error ? error : undefined
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
// PostgreSQL Database Factory
// ============================================================================

export interface PostgreSQLFactoryConfig {
  configs: Record<string, PostgreSQLClientConfig>;
  defaultRegion?: string;
}

export class PostgreSQLDbFactory implements DbFactory {
  private clientManager: PostgreSQLClientManager;
  private defaultRegion: string;

  constructor(config: PostgreSQLFactoryConfig) {
    this.clientManager = createPostgreSQLClientManager(config.configs);
    this.defaultRegion = config.defaultRegion || "US";
  }

  async forTenant(tenantId: string): Promise<{ tx: Txn; repos: TxCtx }> {
    try {
      const client = this.clientManager.getClientForTenant(tenantId);
      const tx = new PostgreSQLTransaction(client, tenantId);

      const repos: TxCtx = {
        passports: new PostgreSQLPassportRepo(client.connection, tenantId),
        decisions: new PostgreSQLDecisionLogRepo(client.connection, tenantId),
        policies: new PostgreSQLPolicyRepo(client.connection, tenantId),
        orgs: new PostgreSQLOrgRepo(client.connection, tenantId),
        refunds: new PostgreSQLRefundRepo(client.connection, tenantId),
        idempotency: new PostgreSQLIdempotencyRepo(client.connection, tenantId),
      };

      return { tx, repos };
    } catch (error) {
      throw new TenantNotFoundError(tenantId);
    }
  }

  async forRegion(region: string): Promise<{ tx: Txn; repos: TxCtx }> {
    try {
      const client = this.clientManager.getClient(region);
      const tx = new PostgreSQLTransaction(client, "system");

      const repos: TxCtx = {
        passports: new PostgreSQLPassportRepo(client.connection, "system"),
        decisions: new PostgreSQLDecisionLogRepo(client.connection, "system"),
        policies: new PostgreSQLPolicyRepo(client.connection, "system"),
        orgs: new PostgreSQLOrgRepo(client.connection, "system"),
        refunds: new PostgreSQLRefundRepo(client.connection, "system"),
        idempotency: new PostgreSQLIdempotencyRepo(client.connection, "system"),
      };

      return { tx, repos };
    } catch (error) {
      throw new RegionUnavailableError(region);
    }
  }

  async forAdmin(): Promise<{ tx: Txn; repos: TxCtx }> {
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
    // TODO: Implement PostgreSQL health check
    throw new Error("PostgreSQLDbFactory.healthCheck() not implemented yet");
  }
}

// ============================================================================
// Factory Creation Functions
// ============================================================================

export function createPostgreSQLDbFactory(
  config: PostgreSQLFactoryConfig
): PostgreSQLDbFactory {
  return new PostgreSQLDbFactory(config);
}

export function createPostgreSQLDbFactoryFromEnv(): PostgreSQLDbFactory {
  // TODO: Implement environment-based PostgreSQL factory creation
  // This would read PostgreSQL connection configs from environment variables
  throw new Error("createPostgreSQLDbFactoryFromEnv() not implemented yet");
}
