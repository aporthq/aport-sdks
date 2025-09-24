# Agent Passport Express Middleware Examples

This directory contains examples showing how to integrate Agent Passport middleware with Express.js applications.

## 📁 Examples Overview

### 1. `simple-standard-example.js` ⭐ **RECOMMENDED**
**Perfect for most use cases - 5-minute integration**

- ✅ Explicit agent ID passed to middleware
- ✅ Context from business logic, not headers
- ✅ Simple and clear
- ✅ Just the essentials

### 2. `complete-integration-example.js`
**Complete flow with before/after comparison**

- ✅ Shows manual vs middleware approach
- ✅ Uses explicit agent ID: `agents/ap_128094d3`
- ✅ Perfect for understanding the benefits
- ✅ 6-minute integration

### 3. `standard-middleware-example.js`
**Advanced patterns and multiple approaches**

- ✅ Multiple middleware patterns
- ✅ Global vs route-specific
- ✅ Multiple agents
- ✅ Dynamic agent ID
- ✅ For advanced use cases

## 🚀 Quick Start (5 minutes)

If you already have an agent ID (e.g., `agents/ap_128094d3`):

```bash
# 1. Install dependencies
npm install express

# 2. Copy the simple standard example
cp simple-standard-example.js my-app.js

# 3. Run your app
node my-app.js

# 4. Test (no agent ID header needed - it's explicit in middleware)
curl -X POST http://localhost:3000/api/refunds \
  -H "Content-Type: application/json" \
  -d '{"amount": 25.00}'
```

## 🔄 How It Works

### The Standard Flow:

1. **Agent ID**: Passed explicitly when creating middleware
2. **Policy ID**: Specified in the route
3. **Context**: Comes from your business logic, not headers
4. **Verification**: Middleware calls Agent Passport API
5. **Enforcement**: Policy rules applied based on agent capabilities/limits
6. **Decision**: Request allowed/blocked based on verification result

### No More Magic:
- ❌ No header extraction
- ❌ No hidden behavior
- ❌ No dependency on request headers
- ✅ Explicit agent ID
- ✅ Explicit context
- ✅ Standard middleware patterns

## 📋 Basic Usage

```javascript
const express = require("express");
const { requirePolicy } = require("@aporthq/middleware-express");

const app = express();
app.use(express.json());

// Your existing agent ID
const AGENT_ID = "agents/ap_128094d3";

// Protect a single endpoint
app.post("/api/refunds", 
  requirePolicy("refunds.v1", AGENT_ID), // ← Agent ID passed explicitly!
  (req, res) => {
    // Your business logic - policy already verified!
    res.json({ success: true });
  }
);

app.listen(3000);
```

## 🛡️ Policy Types

### `refunds.v1`
- **Validates**: Amount limits, region access
- **Context**: `{ amount: 25.00, currency: "USD", region: "US" }`

### `data_export.v1`
- **Validates**: Row limits, PII access
- **Context**: `{ rows: 1000, format: "json", contains_pii: false }`

### `repo.v1`
- **Validates**: Repository access, branch access, PR size, path allowlist, review requirements
- **Context**: `{ repository: "myorg/repo", base_branch: "main", pr_size_kb: 50 }`

### `messaging.v1`
- **Validates**: Channel access, rate limits, mention policies
- **Context**: `{ channel: "general", message_count: 5, mentions: ["@user1"] }`

## ⚙️ Configuration

```javascript
const policyMiddleware = createPolicyEnforcementMiddleware({
  apiBaseUrl: "https://api.aport.io", // Your API URL
  failClosed: true,                    // Block on verification failure
  cacheTtl: 60,                       // Cache verification results (seconds)
  strictMode: true,                   // Strict policy enforcement
  logViolations: true,                // Log policy violations
});
```

## 🚨 Error Handling

```javascript
app.use((err, req, res, next) => {
  if (err.name === "PolicyViolationError") {
    return res.status(403).json({
      error: "policy_violation",
      message: err.message,
      violations: err.violations,
      agent_id: err.agent_id,
      policy_id: err.policy_id,
    });
  }
  next(err);
});
```

## 🧪 Testing

### Test with valid agent ID:
```bash
curl -X POST http://localhost:3000/api/refunds \
  -H "X-Agent-Passport-Id: agents/ap_128094d3" \
  -H "Content-Type: application/json" \
  -d '{"amount": 25.00}'
```

### Test without agent ID (should fail):
```bash
curl -X POST http://localhost:3000/api/refunds \
  -H "Content-Type: application/json" \
  -d '{"amount": 25.00}'
```

### Test with invalid agent ID (should fail):
```bash
curl -X POST http://localhost:3000/api/refunds \
  -H "X-Agent-Passport-Id: invalid_agent_id" \
  -H "Content-Type: application/json" \
  -d '{"amount": 25.00}'
```

## 📚 More Examples

- **Complete Integration**: `complete-integration-example.js` - Perfect for existing agent IDs
- **Full Guide**: `10-minute-integration.js` - Includes passport creation
- **Best Practices**: `setup-best-practices.js` - Advanced patterns and configurations

## ❓ Common Questions

### Q: Do I need to create a new passport?
**A**: No! If you already have an agent ID, just use it directly. The middleware will verify it automatically.

### Q: How does the middleware get the agent ID?
**A**: The middleware automatically extracts the agent ID from request headers (`X-Agent-Passport-Id`, `X-Agent-ID`, or `Authorization: Bearer`).

### Q: Can I use different policies for different routes?
**A**: Yes! Use `requirePolicy("policy_name")` on each route you want to protect.

### Q: What happens if verification fails?
**A**: The middleware blocks the request and returns a 403 error with violation details.

### Q: Can I cache verification results?
**A**: Yes! Set `cacheTtl` in the configuration to cache results for better performance.

## 🎯 Summary

**For integrators with existing agent IDs:**
1. Use `complete-integration-example.js`
2. Replace `agents/ap_128094d3` with your actual agent ID
3. Add `requirePolicy("policy_name")` to your endpoints
4. That's it! Your endpoints are now protected.

**The middleware handles everything automatically:**
- ✅ Agent ID extraction from headers
- ✅ Agent verification via API
- ✅ Policy enforcement based on agent capabilities/limits
- ✅ Context-specific validation
- ✅ Error handling and logging