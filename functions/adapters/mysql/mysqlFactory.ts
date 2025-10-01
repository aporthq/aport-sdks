/**
 * MySQL Database Factory
 *
 * This module implements the DbFactory interface using MySQL database.
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
  createMySQLClient,
  createMySQLClientManager,
  MySQLClient,
  MySQLClientManager,
  MySQLClientConfig,
} from "./mysqlClient";
import {
  MySQLPassportRepo,
  MySQLDecisionLogRepo,
  MySQLPolicyRepo,
  MySQLOrgRepo,
  MySQLRefundRepo,
  MySQLIdempotencyRepo,
} from "./mysqlRepos";

// ============================================================================
// MySQL Transaction Implementation
// ============================================================================

export class MySQLTransaction implements Txn {
  private active = true;
  private id = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  constructor(private client: MySQLClient, private orgId: string) {}

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
        passports: new MySQLPassportRepo(this.client.connection, this.orgId),
        decisions: new MySQLDecisionLogRepo(this.client.connection, this.orgId),
        policies: new MySQLPolicyRepo(this.client.connection, this.orgId),
        orgs: new MySQLOrgRepo(this.client.connection, this.orgId),
        refunds: new MySQLRefundRepo(this.client.connection, this.orgId),
        idempotency: new MySQLIdempotencyRepo(
          this.client.connection,
          this.orgId
        ),
      };

      // TODO: Implement MySQL transaction handling
      // This would use MySQL's transaction support
      throw new Error("MySQLTransaction.run() not implemented yet");
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
// MySQL Database Factory
// ============================================================================

export interface MySQLFactoryConfig {
  configs: Record<string, MySQLClientConfig>;
  defaultRegion?: string;
}

export class MySQLDbFactory implements DbFactory {
  private clientManager: MySQLClientManager;
  private defaultRegion: string;

  constructor(config: MySQLFactoryConfig) {
    this.clientManager = createMySQLClientManager(config.configs);
    this.defaultRegion = config.defaultRegion || "US";
  }

  async forTenant(tenantId: string): Promise<{ tx: Txn; repos: TxCtx }> {
    try {
      const client = this.clientManager.getClientForTenant(tenantId);
      const tx = new MySQLTransaction(client, tenantId);

      const repos: TxCtx = {
        passports: new MySQLPassportRepo(client.connection, tenantId),
        decisions: new MySQLDecisionLogRepo(client.connection, tenantId),
        policies: new MySQLPolicyRepo(client.connection, tenantId),
        orgs: new MySQLOrgRepo(client.connection, tenantId),
        refunds: new MySQLRefundRepo(client.connection, tenantId),
        idempotency: new MySQLIdempotencyRepo(client.connection, tenantId),
      };

      return { tx, repos };
    } catch (error) {
      throw new TenantNotFoundError(tenantId);
    }
  }

  async forRegion(region: string): Promise<{ tx: Txn; repos: TxCtx }> {
    try {
      const client = this.clientManager.getClient(region);
      const tx = new MySQLTransaction(client, "system");

      const repos: TxCtx = {
        passports: new MySQLPassportRepo(client.connection, "system"),
        decisions: new MySQLDecisionLogRepo(client.connection, "system"),
        policies: new MySQLPolicyRepo(client.connection, "system"),
        orgs: new MySQLOrgRepo(client.connection, "system"),
        refunds: new MySQLRefundRepo(client.connection, "system"),
        idempotency: new MySQLIdempotencyRepo(client.connection, "system"),
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
    // TODO: Implement MySQL health check
    throw new Error("MySQLDbFactory.healthCheck() not implemented yet");
  }
}

// ============================================================================
// Factory Creation Functions
// ============================================================================

export function createMySQLDbFactory(
  config: MySQLFactoryConfig
): MySQLDbFactory {
  return new MySQLDbFactory(config);
}

export function createMySQLDbFactoryFromEnv(): MySQLDbFactory {
  // TODO: Implement environment-based MySQL factory creation
  // This would read MySQL connection configs from environment variables
  throw new Error("createMySQLDbFactoryFromEnv() not implemented yet");
}
