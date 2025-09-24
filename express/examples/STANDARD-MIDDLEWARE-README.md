# Standard Agent Passport Middleware

This directory contains examples showing the **standard middleware approach** for Agent Passport integration with Express.js applications.

## 🎯 **Key Improvements**

### **❌ Old Approach (Header-based):**
```javascript
// ❌ Magic header extraction
app.post("/api/refunds", requirePolicy("refunds.v1"), handler);
// Middleware extracts agent ID from headers automatically
```

### **✅ New Approach (Explicit):**
```javascript
// ✅ Explicit agent ID and context
app.post("/api/refunds", requirePolicy("refunds.v1", AGENT_ID), handler);
// Agent ID passed explicitly, context from business logic
```

## 📁 **Examples Overview**

### 1. `simple-standard-example.js` ⭐ **RECOMMENDED**
**Perfect for most use cases**

- ✅ Explicit agent ID passed to middleware
- ✅ Context from business logic, not headers
- ✅ Simple and clear
- ✅ 5-minute integration

### 2. `standard-middleware-example.js`
**Complete guide with all approaches**

- ✅ Multiple middleware patterns
- ✅ Global vs route-specific
- ✅ Multiple agents
- ✅ Dynamic agent ID
- ✅ Advanced use cases

## 🚀 **Quick Start (5 minutes)**

```javascript
const express = require("express");
const { requirePolicy, requirePolicyWithContext } = require("@aporthq/middleware-express");

const app = express();
app.use(express.json());

// Your existing agent ID
const AGENT_ID = "agents/ap_128094d3";

// Basic policy enforcement
app.post("/api/refunds", 
  requirePolicy("refunds.v1", AGENT_ID), // ← Agent ID passed explicitly
  (req, res) => {
    // Your business logic - policy already verified!
    res.json({ success: true });
  }
);

// Explicit context from business logic
app.post("/api/data/export", 
  (req, res, next) => {
    const context = {
      rows: req.body.rows,
      contains_pii: req.body.contains_pii,
      // Add any additional context your policy needs
    };
    return requirePolicyWithContext("data_export.v1", AGENT_ID, context)(req, res, next);
  },
  (req, res) => {
    res.json({ success: true });
  }
);

app.listen(3000);
```

## 🔄 **How It Works**

### **The Standard Flow:**

1. **Agent ID**: Passed explicitly when creating middleware
2. **Policy ID**: Specified in the route
3. **Context**: Comes from your business logic, not headers
4. **Verification**: Middleware calls Agent Passport API
5. **Enforcement**: Policy rules applied based on agent capabilities/limits
6. **Decision**: Request allowed/blocked based on verification result

### **No More Magic:**
- ❌ No header extraction
- ❌ No hidden behavior
- ❌ No dependency on request headers
- ✅ Explicit agent ID
- ✅ Explicit context
- ✅ Standard middleware patterns

## 📋 **Available Functions**

### **1. `requirePolicy(policyId, agentId)`**
Basic policy enforcement with context from request body.

```javascript
app.post("/api/refunds", 
  requirePolicy("refunds.v1", AGENT_ID),
  (req, res) => {
    // Context comes from req.body automatically
    res.json({ success: true });
  }
);
```

### **2. `requirePolicyWithContext(policyId, agentId, context)`**
Policy enforcement with explicit context from business logic.

```javascript
app.post("/api/data/export", 
  (req, res, next) => {
    const context = {
      rows: req.body.rows,
      contains_pii: req.body.contains_pii,
      user_id: req.body.user_id,
    };
    return requirePolicyWithContext("data_export.v1", AGENT_ID, context)(req, res, next);
  },
  (req, res) => {
    res.json({ success: true });
  }
);
```

### **3. `createAgentPassportMiddleware(agentId, config)`**
Create middleware with explicit agent ID for custom use cases.

```javascript
const middleware = createAgentPassportMiddleware(AGENT_ID, {
  apiBaseUrl: "https://api.aport.io",
  failClosed: true,
  cacheTtl: 60,
});

app.post("/api/refunds", 
  (req, res, next) => {
    req.policyId = "refunds.v1";
    next();
  },
  middleware,
  (req, res) => {
    res.json({ success: true });
  }
);
```

### **4. `agentPassportMiddleware(agentId, config)`**
Global middleware that applies when policy ID is set.

```javascript
app.use(agentPassportMiddleware(AGENT_ID));

app.post("/api/refunds", 
  (req, res, next) => {
    req.policyId = "refunds.v1";
    next();
  },
  (req, res) => {
    res.json({ success: true });
  }
);
```

## 🛡️ **Policy Types**

### **`refunds.v1`**
- **Validates**: Amount limits, region access
- **Context**: `{ amount: 25.00, currency: "USD", region: "US" }`

### **`data_export.v1`**
- **Validates**: Row limits, PII access
- **Context**: `{ rows: 1000, format: "json", contains_pii: false }`

### **`repo.v1`**
- **Validates**: Repository access, branch access, PR size, path allowlist, review requirements
- **Context**: `{ repository: "myorg/repo", base_branch: "main", pr_size_kb: 50 }`

### **`messaging.v1`**
- **Validates**: Channel access, rate limits, mention policies
- **Context**: `{ channel: "general", message_count: 5, mentions: ["@user1"] }`

## ⚙️ **Configuration**

```javascript
const config = {
  apiBaseUrl: "https://api.aport.io", // Your API URL
  failClosed: true,                    // Block on verification failure
  cacheTtl: 60,                       // Cache verification results (seconds)
  enabled: true,                      // Enable/disable middleware
  strictMode: true,                   // Strict policy enforcement
  logViolations: true,                // Log policy violations
};
```

## 🚨 **Error Handling**

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

## 🧪 **Testing**

### **Test with valid agent ID:**
```bash
curl -X POST http://localhost:3000/api/refunds \
  -H "Content-Type: application/json" \
  -d '{"amount": 25.00, "currency": "USD"}'
```

### **Test with explicit context:**
```bash
curl -X POST http://localhost:3000/api/data/export \
  -H "Content-Type: application/json" \
  -d '{"rows": 1000, "format": "json", "contains_pii": false, "user_id": "user123"}'
```

## 🎯 **Best Practices**

### **1. Use Explicit Agent ID**
```javascript
// ✅ Good: Explicit agent ID
const AGENT_ID = "agents/ap_128094d3";
app.post("/api/refunds", requirePolicy("refunds.v1", AGENT_ID), handler);

// ❌ Bad: Magic header extraction
app.post("/api/refunds", requirePolicy("refunds.v1"), handler);
```

### **2. Use Explicit Context**
```javascript
// ✅ Good: Explicit context from business logic
const context = {
  rows: req.body.rows,
  contains_pii: req.body.contains_pii,
  user_id: req.body.user_id,
};
return requirePolicyWithContext("data_export.v1", AGENT_ID, context)(req, res, next);

// ❌ Bad: Relying on request body automatically
app.post("/api/data/export", requirePolicy("data_export.v1", AGENT_ID), handler);
```

### **3. Handle Multiple Agents**
```javascript
// ✅ Good: Different agents for different purposes
const REFUNDS_AGENT_ID = "agents/ap_128094d3";
const DATA_AGENT_ID = "agents/ap_128094d3";

app.post("/api/refunds", requirePolicy("refunds.v1", REFUNDS_AGENT_ID), handler);
app.post("/api/data/export", requirePolicy("data_export.v1", DATA_AGENT_ID), handler);
```

### **4. Use Helper Functions**
```javascript
// ✅ Good: Use helper functions to get policy results
app.post("/api/refunds", requirePolicy("refunds.v1", AGENT_ID), (req, res) => {
  const policyResult = getPolicyResult(req);
  const agentPassport = getAgentPassport(req);
  const policy = getPolicy(req);
  
  res.json({ 
    success: true,
    agent_id: agentPassport?.agent_id,
    policy_id: policy?.id,
    checks: policyResult?.checks
  });
});
```

## ❓ **Common Questions**

### **Q: Do I need to change my existing code?**
**A**: Yes, but it's a simple change. Replace `requirePolicy("policy_name")` with `requirePolicy("policy_name", AGENT_ID)`.

### **Q: Where does the agent ID come from?**
**A**: You pass it explicitly when creating the middleware. It comes from your existing system (database, config, etc.).

### **Q: How do I handle multiple agents?**
**A**: Create separate middleware for each agent or use dynamic agent ID determination.

### **Q: Can I still use request body for context?**
**A**: Yes! Use `requirePolicy()` for automatic context from request body, or `requirePolicyWithContext()` for explicit context.

### **Q: Is this more secure?**
**A**: Yes! No dependency on headers means no risk of header manipulation or missing headers.

## 🎉 **Summary**

**The new standard approach is:**
- ✅ **Explicit**: Agent ID and context passed explicitly
- ✅ **Clear**: No magic or hidden behavior
- ✅ **Standard**: Follows Express.js middleware conventions
- ✅ **Flexible**: Multiple approaches for different use cases
- ✅ **Secure**: No dependency on headers
- ✅ **Testable**: Easy to test and debug

**Migration from old approach:**
```javascript
// Old
app.post("/api/refunds", requirePolicy("refunds.v1"), handler);

// New
app.post("/api/refunds", requirePolicy("refunds.v1", AGENT_ID), handler);
```

**That's it!** Your existing agent ID is now fully protected with enterprise-grade access control, validation, and policy enforcement using standard middleware patterns! 🎉
