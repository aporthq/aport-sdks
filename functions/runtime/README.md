# Tenant Durable Object (TenantDO)

This directory contains the Tenant Durable Object implementation that provides single-writer semantics per tenant, ensuring data consistency and integrity in the multi-tenant architecture.

## Overview

The TenantDO is a Cloudflare Durable Object that provides:

- **Single-Writer Semantics**: Only one write operation per tenant at a time
- **Atomic Counters**: Safe refund counter management
- **Idempotency**: Prevents duplicate operations
- **Audit Hash-Chain**: Cryptographically linked Verifiable Attestation
- **Optimistic Concurrency**: Version-based conflict detection

## Files

- `TenantDO.ts` - Main Durable Object implementation
- `TenantDOClient.ts` - Client for communicating with TenantDO
- `__tests__/TenantDO.test.ts` - Unit tests

## Message Types

The TenantDO supports the following message types:

### CREATE_PASSPORT

Creates a new passport with validation and Verifiable Attestation.

```typescript
{
  type: "CREATE_PASSPORT",
  payload: PassportRow,
  requestId: string
}
```

### UPDATE_PASSPORT

Updates an existing passport with optimistic concurrency control.

```typescript
{
  type: "UPDATE_PASSPORT",
  payload: PassportRow,
  expectedVersion: number,
  requestId: string
}
```

### STATUS_CHANGE

Changes the status of a passport (draft, active, suspended, revoked).

```typescript
{
  type: "STATUS_CHANGE",
  payload: {
    agentId: string,
    status: "draft" | "active" | "suspended" | "revoked",
    reason?: string
  },
  requestId: string
}
```

### REFUND_CONSUME

Processes a refund with atomic counter management and idempotency.

```typescript
{
  type: "REFUND_CONSUME",
  payload: {
    agentId: string,
    currency: string,
    amountMinor: number,
    idempotencyKey: string
  },
  requestId: string
}
```

### APPEND_DECISION

Appends a decision event to the Verifiable Attestation with hash-chain consistency.

```typescript
{
  type: "APPEND_DECISION",
  payload: DecisionEventRow,
  requestId: string
}
```

## Usage

### From Handlers

```typescript
import { createTenantDOClientFromEnv } from "./runtime/TenantDOClient";

export const onRequestPost = async ({ request, env }) => {
  const tenantDO = createTenantDOClientFromEnv(env, "ap_org_123");
  
  // Create passport
  const passport = await tenantDO.createPassport({
    agent_id: "ap_123456789",
    slug: "test-agent",
    name: "Test Agent",
    // ... other fields
  });
  
  // Process refund
  const refundResult = await tenantDO.consumeRefund(
    "ap_123456789",
    "USD",
    100,
    "refund_123"
  );
  
  return new Response(JSON.stringify(passport));
};
```

### From Services

```typescript
import { TenantDOClient } from "./runtime/TenantDOClient";

class PassportService {
  constructor(private tenantDO: TenantDOClient) {}
  
  async createPassport(passport: PassportRow): Promise<PassportRow> {
    return await this.tenantDO.createPassport(passport);
  }
  
  async updatePassport(passport: PassportRow, expectedVersion: number): Promise<PassportRow> {
    return await this.tenantDO.updatePassport(passport, expectedVersion);
  }
}
```

## Key Features

### 1. Single-Writer Semantics

Each tenant has its own Durable Object instance, ensuring that only one write operation can happen at a time for that tenant. This prevents:

- Race conditions in passport updates
- Inconsistent refund counter states
- Corrupted Verifiable Attestation

### 2. Atomic Counters

Refund counters are managed in-memory within the Durable Object, ensuring atomic operations:

```typescript
// Two concurrent refunds exceeding daily cap → only one succeeds
const refund1 = tenantDO.consumeRefund("agent1", "USD", 600, "key1");
const refund2 = tenantDO.consumeRefund("agent1", "USD", 600, "key2");
// Only one will succeed if daily limit is 1000
```

### 3. Idempotency

All operations are idempotent through idempotency keys:

```typescript
// Same operation with same key returns cached result
const result1 = await tenantDO.consumeRefund("agent1", "USD", 100, "refund_123");
const result2 = await tenantDO.consumeRefund("agent1", "USD", 100, "refund_123");
// result2 === result1 (cached)
```

### 4. Audit Hash-Chain

Every decision is cryptographically linked to the previous one:

```typescript
// Each decision includes:
{
  decision_id: "dec_123",
  prev_hash: "abc123...", // Hash of previous decision
  record_hash: "def456...", // Hash of this decision
  // ... other fields
}
```

### 5. Optimistic Concurrency

Passport updates use version numbers to prevent conflicts:

```typescript
// Update with expected version
const updated = await tenantDO.updatePassport(passport, expectedVersion);
// Throws ConcurrencyError if version doesn't match
```

## Configuration

### Environment Variables

```typescript
// Required for TenantDO
env.TENANT_DO = "TENANT_DO_NAMESPACE"; // Durable Object namespace
env.D1_US = "D1_US_BINDING"; // US region D1 binding
env.D1_EU = "D1_EU_BINDING"; // EU region D1 binding
env.D1_CA = "D1_CA_BINDING"; // CA region D1 binding
env.DEFAULT_REGION = "US"; // Default region
```

### Durable Object Binding

```typescript
// wrangler.toml
[[durable_objects.bindings]]
name = "TENANT_DO"
class_name = "TenantDO"
script_name = "agent-passport"
```

## Error Handling

The TenantDO provides comprehensive error handling:

- **ConcurrencyError**: Version conflicts in passport updates
- **ValidationError**: Invalid passport data
- **NotFoundError**: Passport not found
- **LimitExceededError**: Refund limits exceeded
- **IdempotencyError**: Duplicate operation detected

## Monitoring

### Health Check

```typescript
const health = await tenantDO.getHealth();
// Returns:
{
  success: true,
  tenantId: "ap_org_123",
  activeRequests: 2,
  lastDecisionHash: "abc123...",
  refundCounters: 5,
  idempotencyKeys: 10
}
```

### State Inspection

```typescript
const state = await tenantDO.getState();
// Returns:
{
  tenantId: "ap_org_123",
  state: {
    lastDecisionHash: "abc123...",
    lastDecisionId: "dec_456",
    refundCounters: { "agent1:USD:2024-01-01": 100 },
    idempotencyKeys: ["refund_123", "refund_124"],
    activeRequests: ["req_789", "req_790"]
  }
}
```

## Performance Characteristics

- **Latency**: ~10-50ms per operation (Durable Object overhead)
- **Throughput**: ~1000 operations/second per tenant
- **Memory**: ~1MB per tenant (in-memory state)
- **Persistence**: All data persisted to D1 database

## Testing

Run the unit tests:

```bash
npm test functions/runtime/__tests__/TenantDO.test.ts
```

The tests cover:

- All message types
- Concurrency scenarios
- Error conditions
- Idempotency behavior
- Audit hash-chain consistency

## Best Practices

1. **Always use idempotency keys** for refund operations
2. **Handle ConcurrencyError** in passport updates
3. **Monitor tenant state** for debugging
4. **Use request IDs** for tracing
5. **Implement retry logic** for transient failures

## Troubleshooting

### Common Issues

1. **Version Conflicts**: Handle ConcurrencyError with retry logic
2. **Refund Limits**: Check daily limits and remaining amounts
3. **Idempotency**: Ensure unique idempotency keys
4. **Audit Chain**: Verify hash-chain consistency

### Debugging

1. Check tenant health status
2. Inspect tenant state
3. Review Verifiable Attestation
4. Monitor active requests
