# D1 Adapter

This directory contains the D1 database adapter implementation using Drizzle ORM. It provides a complete implementation of the database ports for Cloudflare D1.

## Files

- `d1Client.ts` - D1 client factory and multi-region management
- `d1Repos.ts` - Repository implementations for all data access
- `d1Factory.ts` - Database factory implementation
- `index.ts` - Re-exports for easy importing
- `__tests__/` - Unit tests for all components

## Features

- **Multi-Region Support**: Automatic region resolution based on tenant
- **Tenant Isolation**: All operations scoped to organization ID
- **Optimistic Concurrency**: Version-based conflict detection
- **Transaction Safety**: ACID transactions for complex operations
- **Type Safety**: Full TypeScript support with Drizzle ORM
- **JSON Field Support**: Automatic serialization/deserialization
- **Verifiable Attestation**: Hash-chain support for decision logging

## Usage

### Basic Setup

```typescript
import { createD1DbFactoryFromEnv } from "./adapters/d1";

// Create factory from environment
const factory = createD1DbFactoryFromEnv({
  D1_US: env.D1_US,
  D1_EU: env.D1_EU,
  DEFAULT_REGION: "US",
});

// Get tenant-specific connection
const { tx, repos } = await factory.forTenant("ap_org_123");
```

### Transaction Usage

```typescript
// Execute operations within a transaction
const result = await tx.run(async (ctx) => {
  // Create passport
  const passport = {
    agent_id: "ap_123456789",
    slug: "test-agent",
    name: "Test Agent",
    owner_id: "ap_org_123",
    // ... other fields
  };
  
  await ctx.passports.create(passport);
  
  // Log decision
  await ctx.decisions.append({
    decision_id: "dec_123",
    org_id: "ap_org_123",
    agent_id: "ap_123456789",
    policy_pack_id: "refunds",
    decision: "allow",
    reason: "Created successfully",
    context: { action: "create" },
    created_at: new Date().toISOString(),
    record_hash: "hash123",
  });
  
  return passport;
});
```

### Repository Operations

```typescript
// Passport operations
const passport = await ctx.passports.getById("ap_org_123", "ap_123456789");
const passports = await ctx.passports.listByOrg("ap_org_123", "template");
const isUnique = await ctx.passports.isSlugUnique("ap_org_123", "my-slug");

// Organization operations
const org = await ctx.orgs.getById("ap_org_123");
const tenant = await ctx.orgs.getTenant("ap_org_123");

// Refund operations
const result = await ctx.refunds.tryConsume("ap_org_123", "ap_123456789", "USD", 100);

// Idempotency operations
const idempotent = await ctx.idempotency.checkAndStore("key123", "ap_org_123", "ap_123456789", "refund", { amount: 100 }, 3600);
```

## Database Schema

The adapter uses a comprehensive SQLite schema with the following tables:

- `passports` - Core passport data with JSON fields for complex data
- `organizations` - Organization/tenant information
- `tenants` - Tenant configuration and region mapping
- `policies` - Policy definitions and rules
- `decision_events` - Verifiable Attestation for policy decisions
- `refund_counters` - Atomic counters for refund limits
- `idempotency_keys` - Idempotency key management

## Error Handling

The adapter provides specific error types:

- `ConcurrencyError` - Optimistic concurrency conflicts
- `TenantNotFoundError` - Tenant resolution errors
- `RegionUnavailableError` - Region-specific errors
- `TransactionError` - General transaction failures

## Testing

Run the unit tests:

```bash
npm test functions/adapters/d1/__tests__
```

The tests cover:
- Repository CRUD operations
- Transaction management
- Error handling
- Type safety
- Multi-tenant isolation

## Migration

The adapter includes database initialization and migration support:

```typescript
import { initializeDatabase } from "./adapters/d1";

// Initialize database with tables
await initializeDatabase(client, {
  createTables: true,
  runMigrations: false,
  seedData: false,
});
```

## Performance

- **Optimized Queries**: Uses Drizzle ORM for efficient SQL generation
- **Connection Pooling**: Built-in connection management
- **Indexing**: Comprehensive indexes for common query patterns
- **JSON Fields**: Efficient serialization for complex data types
- **Batch Operations**: Support for bulk operations where needed
