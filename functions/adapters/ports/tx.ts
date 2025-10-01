/**
 * Database transaction interfaces
 *
 * These ports define the contract for database transactions and connection
 * management without coupling to specific database implementations.
 */

import { TxCtx } from "./repos";

// ============================================================================
// Transaction Interfaces
// ============================================================================

export interface Txn {
  /**
   * Execute a function within a database transaction
   *
   * @param fn Function to execute with transaction context
   * @returns Result of the function execution
   * @throws TransactionError if transaction fails
   */
  run<T>(fn: (ctx: TxCtx) => Promise<T>): Promise<T>;

  /**
   * Check if currently in a transaction
   */
  isActive(): boolean;

  /**
   * Get transaction ID for debugging
   */
  getId(): string;
}

// ============================================================================
// Database Factory Interface
// ============================================================================

export interface DbFactory {
  /**
   * Get database connection and repositories for a specific tenant
   *
   * @param tenantId Organization/tenant ID
   * @returns Transaction manager and repository context
   */
  forTenant(tenantId: string): Promise<{
    tx: Txn;
    repos: TxCtx;
  }>;

  /**
   * Get database connection for a specific region
   *
   * @param region Region identifier (US, EU, CA, etc.)
   * @returns Transaction manager and repository context
   */
  forRegion(region: string): Promise<{
    tx: Txn;
    repos: TxCtx;
  }>;

  /**
   * Get database connection for admin operations (cross-tenant)
   *
   * @returns Transaction manager and repository context
   */
  forAdmin(): Promise<{
    tx: Txn;
    repos: TxCtx;
  }>;

  /**
   * Check if tenant exists and is accessible
   *
   * @param tenantId Organization/tenant ID
   * @returns True if tenant exists and is accessible
   */
  isTenantAccessible(tenantId: string): Promise<boolean>;

  /**
   * Get tenant region information
   *
   * @param tenantId Organization/tenant ID
   * @returns Region information or null if not found
   */
  getTenantRegion(tenantId: string): Promise<string | null>;

  /**
   * Health check for database connections
   *
   * @returns Health status for all regions
   */
  healthCheck(): Promise<
    Record<string, { status: "healthy" | "unhealthy"; latency?: number }>
  >;
}

// ============================================================================
// Error Types
// ============================================================================

export class TransactionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = "TransactionError";
  }
}

export class ConcurrencyError extends TransactionError {
  constructor(
    message: string = "Optimistic concurrency conflict",
    public readonly expectedVersion?: number,
    public readonly actualVersion?: number
  ) {
    super(message, "CONCURRENCY_CONFLICT");
    this.name = "ConcurrencyError";
  }
}

export class TenantNotFoundError extends TransactionError {
  constructor(tenantId: string) {
    super(`Tenant not found: ${tenantId}`, "TENANT_NOT_FOUND");
    this.name = "TenantNotFoundError";
  }
}

export class RegionUnavailableError extends TransactionError {
  constructor(region: string) {
    super(`Region unavailable: ${region}`, "REGION_UNAVAILABLE");
    this.name = "RegionUnavailableError";
  }
}

// ============================================================================
// Transaction Options
// ============================================================================

export interface TransactionOptions {
  /**
   * Transaction isolation level
   */
  isolationLevel?: "read_committed" | "repeatable_read" | "serializable";

  /**
   * Transaction timeout in milliseconds
   */
  timeout?: number;

  /**
   * Retry configuration for transient failures
   */
  retry?: {
    maxAttempts: number;
    backoffMs: number;
  };

  /**
   * Whether to enable read-only optimization
   */
  readOnly?: boolean;
}

// ============================================================================
// Connection Pool Configuration
// ============================================================================

export interface ConnectionConfig {
  /**
   * Maximum number of connections in the pool
   */
  maxConnections: number;

  /**
   * Minimum number of connections to maintain
   */
  minConnections: number;

  /**
   * Connection timeout in milliseconds
   */
  connectionTimeout: number;

  /**
   * Idle connection timeout in milliseconds
   */
  idleTimeout: number;

  /**
   * Whether to enable connection health checks
   */
  healthCheck: boolean;
}

// ============================================================================
// Database Health Status
// ============================================================================

export interface DatabaseHealth {
  region: string;
  status: "healthy" | "unhealthy" | "degraded";
  latency?: number;
  lastCheck: string;
  error?: string;
  connections: {
    active: number;
    idle: number;
    total: number;
  };
}

// ============================================================================
// Migration Interface
// ============================================================================

export interface Migration {
  version: number;
  name: string;
  up: (tx: Txn) => Promise<void>;
  down: (tx: Txn) => Promise<void>;
}

export interface MigrationRunner {
  /**
   * Run pending migrations
   */
  migrate(): Promise<{ applied: number; failed: number }>;

  /**
   * Rollback last migration
   */
  rollback(): Promise<boolean>;

  /**
   * Get migration status
   */
  status(): Promise<{ current: number; pending: number[] }>;
}
