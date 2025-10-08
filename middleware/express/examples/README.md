# Agent Passport Express Examples

Simple examples demonstrating the three main usage patterns for Agent Passport Express middleware.

## Quick Start

```bash
# Install dependencies
npm install

# Run JavaScript example
npm start

# Run TypeScript example
npm run start:ts

# Run with auto-reload
npm run dev
```

## Examples

### 1. JavaScript Example (`simple-example.js`)

Demonstrates the three main patterns:

- **Global Policy Enforcement**: Enforce one policy on all routes
- **Explicit Agent ID**: Most secure, explicit agent ID parameter
- **Header Fallback**: Backward compatible, uses `X-Agent-Passport-Id` header
- **Custom Context**: Complex scenarios with custom context data

### 2. TypeScript Example (`typescript-example.ts`)

Same patterns with full TypeScript support:

- Type-safe agent data access
- IntelliSense and auto-completion
- Compile-time error checking
- Full type definitions

## Usage Patterns

### Pattern 1: Global Policy Enforcement

```javascript
// Enforce one policy on all routes
app.use(agentPassportMiddleware({
  policyId: "finance.payment.refund.v1",
  failClosed: true
}));

// All routes below require finance.payment.refund.v1 policy
app.post("/api/refunds", (req, res) => {
  // Policy already verified
});
```

### Pattern 2: Explicit Agent ID (Preferred)

```javascript
// Most secure - explicit agent ID
app.post("/api/refunds", 
  requirePolicy("finance.payment.refund.v1", AGENT_ID),
  (req, res) => {
    // Policy verified with explicit agent ID
  }
);
```

### Pattern 3: Header Fallback

```javascript
// Backward compatible - uses header
app.post("/api/export", 
  requirePolicy("data.export.create.v1"),  // No agent ID
  (req, res) => {
    // Policy verified via X-Agent-Passport-Id header
  }
);
```

### Pattern 4: Custom Context

```javascript
// Complex scenarios with custom context
app.post("/api/repo/pr", 
  requirePolicyWithContext("code.repository.merge.v1", { 
    repository: "myorg/myrepo",
    base_branch: "main" 
  }, AGENT_ID),
  (req, res) => {
    // Policy verified with custom context
  }
);
```

## Testing

### Test Refunds Endpoint

```bash
curl -X POST 'http://localhost:3000/api/refunds' \
  -H 'Content-Type: application/json' \
  -H 'X-Agent-Passport-Id: ap_a2d10232c6534523812423eec8a1425c45678' \
  -d '{
    "amount": 25.00,
    "currency": "USD",
    "order_id": "order_123",
    "customer_id": "cust_456",
    "reason_code": "defective",
    "idempotency_key": "idem_789"
  }'
```

### Test Data Export Endpoint

```bash
curl -X POST 'http://localhost:3000/api/data/export' \
  -H 'Content-Type: application/json' \
  -d '{
    "rows": 1000,
    "format": "json",
    "contains_pii": false
  }'
```

### Test Messaging Endpoint

```bash
curl -X POST 'http://localhost:3000/api/messages/send' \
  -H 'Content-Type: application/json' \
  -H 'X-Agent-Passport-Id: ap_a2d10232c6534523812423eec8a1425c45678' \
  -d '{
    "channel": "general",
    "message_count": 5,
    "mentions": ["@user1"]
  }'
```

## Available Policies

- **finance.payment.refund.v1**: Payment refunds with currency and region validation
- **data.export.create.v1**: Data export with row limits and PII handling
- **messaging.message.send.v1**: Messaging with rate limits and channel restrictions
- **code.repository.merge.v1**: Repository operations with branch protection and PR size limits

## Error Handling

The middleware returns appropriate HTTP status codes:

- **401**: Missing or invalid agent ID
- **403**: Policy violation
- **400**: Field validation failed
- **500**: Internal server error

## TypeScript Benefits

- **Type Safety**: Full type checking for agent data and policy results
- **IntelliSense**: Auto-completion for agent properties and methods
- **Compile-time Errors**: Catch errors before runtime
- **Refactoring**: Safe renaming and restructuring
- **Documentation**: Types serve as inline documentation

## License

MIT