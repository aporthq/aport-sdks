# Agent Passport Middleware - Express

Express middleware for The Passport for AI Agents verification and policy enforcement.

## Installation

```bash
npm install @aporthq/middleware-express
```

## Getting Started

**Key Facts:**

- **Agent ID Required**: Every policy check needs an agent ID
- **Two Options**: Pass agent ID as function parameter (preferred) or use `X-Agent-Passport-Id` header
- **Resolution Priority**: Function parameter > Header > Fail with 401
- **Registry**: Defaults to `https://aport.io` (configurable)
- **Policies**: Choose from `finance.payment.refund.v1`, `data.export.create.v1`, `messaging.message.send.v1`, `code.repository.merge.v1`

| **Method** | **Agent ID Source** | **Security** | **Use Case** |
|------------|-------------------|--------------|--------------|
| **Explicit Parameter** | Function argument | ✅ Highest | Production, explicit control |
| **Header Fallback** | `X-Agent-Passport-Id` | ⚠️ Medium | Backward compatibility |
| **Global Middleware** | `X-Agent-Passport-Id` | ⚠️ Medium | All routes, same policy |

## Quick Start

### 1. Global Policy Enforcement

```javascript
const express = require('express');
const { agentPassportMiddleware } = require('@aporthq/middleware-express');

const app = express();
app.use(express.json());

// Enforce specific policy globally
app.use(agentPassportMiddleware({
  policyId: "finance.payment.refund.v1",  // Enforces refunds policy
  failClosed: true
}));

// All routes now require finance.payment.refund.v1 policy compliance
app.post('/api/refunds', (req, res) => {
  // Policy already verified - safe to process
  const { amount, currency } = req.body;
  res.json({ 
    success: true, 
    refund_id: `ref_${Date.now()}`,
    agent_id: req.agent.agent_id 
  });
});
```

### 2. Route-Specific Policy Enforcement

```javascript
const { requirePolicy } = require('@agent-passport/middleware-express');

const AGENT_ID = "ap_a2d10232c6534523812423eec8a1425c45678"; // Your agent ID

// Explicit agent ID (preferred)
app.post('/api/refunds', 
  requirePolicy("finance.payment.refund.v1", AGENT_ID),
  (req, res) => {
    // Policy verified with explicit agent ID
    res.json({ success: true });
  }
);

// Header fallback
app.post('/api/export', 
  requirePolicy("data.export.create.v1"),  // Uses X-Agent-Passport-Id header
  (req, res) => {
    // Policy verified via header
    res.json({ success: true });
  }
);
```

### 3. Multiple Policies

```javascript
// Different policies for different routes
app.post('/api/refunds', 
  requirePolicy("finance.payment.refund.v1", AGENT_ID),
  (req, res) => res.json({ message: "Refund processed" })
);

app.post('/api/data/export', 
  requirePolicy("data.export.create.v1", AGENT_ID),
  (req, res) => res.json({ message: "Export created" })
);

app.post('/api/messages/send', 
  requirePolicy("messaging.message.send.v1", AGENT_ID),
  (req, res) => res.json({ message: "Message sent" })
);
```

## API Reference

### `agentPassportMiddleware(options)`

Global middleware that enforces a specific policy on all routes.

**Parameters:**

- `options.policyId` (string): Policy ID to enforce (e.g., "finance.payment.refund.v1")
- `options.failClosed` (boolean): Fail if agent ID missing (default: true)
- `options.baseUrl` (string): Registry base URL (default: "https://aport.io")
- `options.timeout` (number): Request timeout in ms (default: 5000)

**Returns:** Express middleware function

### `requirePolicy(policyId, agentId?)`

Route-specific middleware that enforces a specific policy.

**Parameters:**

- `policyId` (string): Policy ID to enforce (e.g., "finance.payment.refund.v1")
- `agentId` (string, optional): Explicit agent ID (preferred over header)

**Returns:** Express middleware function

**Agent ID Resolution:**

1. Function parameter (if provided)
2. `X-Agent-Passport-Id` header (fallback)
3. Fail with 401 error (if neither provided)

### `requirePolicyWithContext(policyId, context, agentId?)`

Route-specific middleware with custom context.

**Parameters:**

- `policyId` (string): Policy ID to enforce
- `context` (object): Custom context data
- `agentId` (string, optional): Explicit agent ID

**Returns:** Express middleware function

## Request Object

After successful policy verification, the request object contains:

```javascript
app.post('/api/refunds', requirePolicy("finance.payment.refund.v1", AGENT_ID), (req, res) => {
  // req.agent - Verified agent passport data
  console.log(req.agent.agent_id);        // "ap_a2d10232c6534523812423eec8a1425c45678"
  console.log(req.agent.assurance_level); // "L2"
  console.log(req.agent.capabilities);    // ["finance.payment.refund"]
  
  // req.policyResult - Policy evaluation result
  console.log(req.policyResult.evaluation.decision_id);
  console.log(req.policyResult.evaluation.remaining_daily_cap);
});
```

## Available Policies

### finance.payment.refund.v1

- **Capabilities:** `["finance.payment.refund"]`
- **Assurance:** L2 minimum
- **Fields:** `order_id`, `customer_id`, `amount_minor`, `currency`, `region`, `reason_code`, `idempotency_key`
- **Rules:** Currency support, region validation, reason code validation, idempotency handling
- **Amount Format:** `amount_minor` must be in cents (e.g., `500` for $5.00)

### data.export.create.v1

- **Capabilities:** `["data.export"]`
- **Assurance:** L1 minimum
- **Fields:** `rows`, `format`, `contains_pii`
- **Rules:** Row limits, PII handling

### messaging.message.send.v1

- **Capabilities:** `["messaging.send"]`
- **Assurance:** L1 minimum
- **Fields:** `channel`, `message_count`, `mentions`
- **Rules:** Rate limits, channel restrictions

### code.repository.merge.v1

- **Capabilities:** `["repo.pr.create", "repo.merge"]`
- **Assurance:** L2 minimum
- **Fields:** `repository`, `base_branch`, `pr_size_kb`
- **Rules:** Repository access, branch protection, PR size limits

## Error Handling

The middleware returns appropriate HTTP status codes:

```javascript
// 401 - Missing or invalid agent ID
{
  "error": "missing_agent_id",
  "message": "Agent ID is required. Provide it as X-Agent-Passport-Id header."
}

// 403 - Policy violation
{
  "error": "policy_violation",
  "message": "Policy violation",
  "agent_id": "ap_a2d10232c6534523812423eec8a1425c45678",
  "policy_id": "finance.payment.refund.v1"
}

// 400 - Field validation failed
{
  "error": "field_validation_failed",
  "message": "Field validation failed: Required field 'order_id' is missing"
}
```

## TypeScript Support

```typescript
import express, { Request, Response } from 'express';
import { 
  agentPassportMiddleware, 
  requirePolicy,
  AgentRequest 
} from '@agent-passport/middleware-express';

const app = express();

// Global policy enforcement
app.use(agentPassportMiddleware({
  policyId: "finance.payment.refund.v1",
  failClosed: true
}));

// Route-specific policy enforcement
app.post('/api/refunds', 
  requirePolicy("finance.payment.refund.v1", "ap_a2d10232c6534523812423eec8a1425c45678"),
  (req: AgentRequest, res: Response) => {
    // Type-safe access to agent data
    const agentId = req.agent.agent_id;
    const policyResult = req.policyResult;
    
    res.json({ success: true, agent_id: agentId });
  }
);
```

## Setup & Agent ID Options

### Key Setup Facts

1. **Agent ID is Required**: Every policy check needs an agent ID
2. **Two Ways to Provide Agent ID**:
   - **Explicit Parameter** (preferred): Pass agent ID directly to function
   - **Header Fallback**: Use `X-Agent-Passport-Id` header
3. **Resolution Priority**: Function parameter > Header > Fail
4. **Registry URL**: Defaults to `https://aport.io` (configurable)
5. **Policy Enforcement**: Happens automatically on all protected routes

### Agent ID Resolution Examples

```javascript
// ✅ EXPLICIT AGENT ID (Most Secure)
const AGENT_ID = "ap_a2d10232c6534523812423eec8a1425c45678";
app.post('/api/refunds', 
  requirePolicy("finance.payment.refund.v1", AGENT_ID),  // Agent ID in function
  handler
);

// ✅ HEADER FALLBACK (Backward Compatible)
app.post('/api/export', 
  requirePolicy("data.export.create.v1"),  // No agent ID - uses header
  handler
);
// Client sends: X-Agent-Passport-Id: ap_a2d10232c6534523812423eec8a1425c45678

// ✅ GLOBAL MIDDLEWARE (Uses Header)
app.use(agentPassportMiddleware({
  policyId: "finance.payment.refund.v1"  // Agent ID from X-Agent-Passport-Id header
}));
```

### Environment Variables

```bash
# Registry base URL (optional)
AGENT_PASSPORT_BASE_URL=https://aport.io

# Default agent ID for development (optional)
AGENT_PASSPORT_AGENT_ID=ap_a2d10232c6534523812423eec8a1425c45678
```

### Skip Paths

```javascript
app.use(agentPassportMiddleware({
  policyId: "finance.payment.refund.v1",
  skipPaths: ["/health", "/metrics", "/status"]
}));
```

## Examples

### E-commerce Refund System

```javascript
const express = require('express');
const { requirePolicy } = require('@agent-passport/middleware-express');

const app = express();
app.use(express.json());

const AGENT_ID = "ap_a2d10232c6534523812423eec8a1425c45678";

// Refund processing with policy enforcement. Amount in cents (100 = $1.00)
app.post('/api/refunds', 
  requirePolicy("finance.payment.refund.v1", AGENT_ID),
  (req, res) => {
    const { amount, currency, order_id, customer_id, reason_code } = req.body;
    
    // Policy already verified - safe to process
    const refund_id = `ref_${Date.now()}`;
    
    res.json({
      success: true,
      refund_id,
      amount,  // Amount in cents
      currency,
      order_id,
      customer_id,
      reason_code,
      agent_id: req.agent.agent_id
    });
  }
);
```

### Data Export System

```javascript
// Data export with policy enforcement
app.post('/api/data/export', 
  requirePolicy("data.export.create.v1", AGENT_ID),
  (req, res) => {
    const { rows, format, contains_pii } = req.body;
    
    // Policy verified - safe to export
    const export_id = `exp_${Date.now()}`;
    
    res.json({
      success: true,
      export_id,
      rows,
      format,
      contains_pii,
      agent_id: req.agent.agent_id
    });
  }
);
```

### Messaging System

```javascript
// Messaging with policy enforcement
app.post('/api/messages/send', 
  requirePolicy("messaging.message.send.v1", AGENT_ID),
  (req, res) => {
    const { channel, message_count, mentions } = req.body;
    
    // Policy verified - safe to send
    const message_id = `msg_${Date.now()}`;
    
    res.json({
      success: true,
      message_id,
      channel,
      message_count,
      mentions,
      agent_id: req.agent.agent_id
    });
  }
);
```

## License

MIT

---

**Last Updated**: 2025-01-16 00:00:00 UTC
