# Database Ports

This directory contains database-agnostic interfaces that define the contract for data access without coupling to specific database implementations (D1, PostgreSQL, etc.).

## Architecture

All handlers should use these ports instead of direct database calls. This allows us to:

- Swap database backends without changing business logic
- Support multiple database types (D1, PostgreSQL, etc.)
- Implement proper transaction management
- Support multi-region and multi-tenant architectures

## Files

- `repos.ts` - Repository interfaces for all data access
- `tx.ts` - Transaction management interfaces
- `index.ts` - Re-exports for easy importing

## Usage

```typescript
import { PassportRepo, TxCtx, DbFactory } from "../adapters/ports";

// In a handler
export const onRequestPost = async ({ request, env }) => {
  const dbFactory = createDbFactory(env);
  const { tx, repos } = await dbFactory.forTenant(orgId);
  
  return await tx.run(async (ctx) => {
    const passport = await ctx.passports.getById(orgId, agentId);
    // ... business logic
  });
};
```

## Key Principles

1. **No Direct Database Access**: All handlers must use these ports
2. **Transaction Safety**: All writes go through transaction context
3. **Tenant Isolation**: All operations are scoped to a tenant (org_id)
4. **Optimistic Concurrency**: Version-based conflict detection
5. **Verifiable Attestation**: All changes are logged with hash chains

## Data Model

- **PassportRow**: Core passport data with JSON fields for complex data
- **OrgRow**: Organization/tenant information with region mapping
- **TenantRow**: Tenant configuration and database binding
- **PolicyRow**: Policy definitions and rules
- **DecisionEventRow**: Verifiable Attestation for policy decisions
- **RefundCounterRow**: Atomic counters for refund limits
- **IdempotencyRow**: Idempotency key management

## Repository Interfaces

- **PassportRepo**: CRUD operations for passports
- **DecisionLogRepo**: Append-only Verifiable Attestation
- **PolicyRepo**: Policy management
- **OrgRepo**: Organization/tenant management
- **RefundRepo**: Atomic refund operations
- **IdempotencyRepo**: Idempotency key management

## Transaction Management

All database operations must be wrapped in transactions to ensure:
- ACID properties
- Optimistic concurrency control
- Verifiable Attestation consistency
- Multi-tenant isolation
