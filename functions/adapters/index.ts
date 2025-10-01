/**
 * Database Adapters Index
 *
 * This module exports all database adapters and related utilities.
 */

// ============================================================================
// D1 Adapter (Existing Implementation)
// ============================================================================

export * from "./d1";

// ============================================================================
// MySQL Adapter (Stub Implementation)
// ============================================================================

export * from "./mysql";

// ============================================================================
// PostgreSQL Adapter (Stub Implementation)
// ============================================================================

export * from "./postgresql";

// ============================================================================
// Repository Ports (Existing Implementation)
// ============================================================================

export type {
  PassportRow,
  DecisionEventRow,
  PolicyRow,
  OrgRow,
  TenantRow,
  RefundCounterRow,
  IdempotencyRow,
  PassportSummary,
  PassportRepo,
  DecisionLogRepo,
  PolicyRepo,
  OrgRepo,
  RefundRepo,
  IdempotencyRepo,
  TxCtx,
  PaginationOptions,
  AuditContext,
} from "./ports/repos";

// ============================================================================
// Convenience Exports
// ============================================================================

// Convenience exports are already included above
