/**
 * Simple Agent Passport Express Middleware Example
 *
 * This example demonstrates the three main usage patterns:
 * 1. Global policy enforcement
 * 2. Route-specific with explicit agent ID
 * 3. Route-specific with header fallback
 */

const express = require("express");
const {
  agentPassportMiddleware,
  requirePolicy,
  requirePolicyWithContext,
} = require("../dist/middleware/express/src/index");

const app = express();
app.use(express.json());

// ============================================================================
// CONFIGURATION
// ============================================================================

const AGENT_ID = "ap_a2d10232c6534523812423eec8a1425c45678"; // Your agent ID

// ============================================================================
// PATTERN 1: GLOBAL POLICY ENFORCEMENT
// ============================================================================

/**
 * Global middleware enforces a specific policy on all routes.
 * Agent ID is extracted from X-Agent-Passport-Id header.
 */
app.use(
  agentPassportMiddleware({
    policyId: "finance.payment.refund.v1", // Enforces refunds policy globally
    failClosed: true,
  })
);

// All routes below now require finance.payment.refund.v1 policy compliance
app.post("/api/refunds", (req, res) => {
  // Policy already verified - safe to process
  const { amount, currency, order_id } = req.body;

  res.json({
    success: true,
    refund_id: `ref_${Date.now()}`,
    amount,
    currency,
    order_id,
    agent_id: req.agent.agent_id,
  });
});

// ============================================================================
// PATTERN 2: ROUTE-SPECIFIC WITH EXPLICIT AGENT ID (PREFERRED)
// ============================================================================

/**
 * Explicit agent ID is most secure and clear.
 * No header extraction needed.
 */
app.post(
  "/api/data/export",
  requirePolicy("data.export.create.v1", AGENT_ID),
  (req, res) => {
    // Policy verified with explicit agent ID
    const { rows, format, contains_pii } = req.body;

    res.json({
      success: true,
      export_id: `exp_${Date.now()}`,
      rows,
      format,
      contains_pii,
      agent_id: req.agent.agent_id,
    });
  }
);

// ============================================================================
// PATTERN 3: ROUTE-SPECIFIC WITH HEADER FALLBACK
// ============================================================================

/**
 * Header fallback for backward compatibility.
 * Uses X-Agent-Passport-Id header.
 */
app.post(
  "/api/messages/send",
  requirePolicy("messaging.message.send.v1"), // No agent ID - uses header
  (req, res) => {
    // Policy verified via header
    const { channel, message_count, mentions } = req.body;

    res.json({
      success: true,
      message_id: `msg_${Date.now()}`,
      channel,
      message_count,
      mentions,
      agent_id: req.agent.agent_id,
    });
  }
);

// ============================================================================
// PATTERN 4: CUSTOM CONTEXT
// ============================================================================

/**
 * Custom context for complex scenarios.
 */
app.post(
  "/api/repo/pr",
  requirePolicyWithContext(
    "code.repository.merge.v1",
    {
      repository: "myorg/myrepo",
      base_branch: "main",
    },
    AGENT_ID
  ),
  (req, res) => {
    // Policy verified with custom context
    const { pr_size_kb, file_path } = req.body;

    res.json({
      success: true,
      pr_id: `pr_${Date.now()}`,
      repository: "myorg/myrepo",
      base_branch: "main",
      pr_size_kb,
      file_path,
      agent_id: req.agent.agent_id,
    });
  }
);

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((err, req, res, next) => {
  console.error("Error:", err);

  if (err.code === "policy_violation") {
    return res.status(403).json({
      error: "policy_violation",
      message: err.message,
      agent_id: err.agentId,
      policy_id: req.policyId,
    });
  }

  res.status(500).json({
    error: "internal_error",
    message: "Internal server error",
  });
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    agent_id: AGENT_ID,
  });
});

// ============================================================================
// STARTUP
// ============================================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Agent Passport Example Server running on port ${PORT}`);
  console.log(`📋 Agent ID: ${AGENT_ID}`);
  console.log("\n📋 Test your endpoints:");
  console.log("\n1. Refunds (Global Policy):");
  console.log(`curl -X POST 'http://localhost:${PORT}/api/refunds' \\`);
  console.log(`  -H 'Content-Type: application/json' \\`);
  console.log(`  -H 'X-Agent-Passport-Id: ${AGENT_ID}' \\`);
  console.log(
    `  -d '{"amount": 25.00, "currency": "USD", "order_id": "order_123", "customer_id": "cust_456", "reason_code": "defective", "idempotency_key": "idem_789"}'`
  );

  console.log("\n2. Data Export (Explicit Agent ID):");
  console.log(`curl -X POST 'http://localhost:${PORT}/api/data/export' \\`);
  console.log(`  -H 'Content-Type: application/json' \\`);
  console.log(`  -d '{"rows": 1000, "format": "json", "contains_pii": false}'`);

  console.log("\n3. Messaging (Header Fallback):");
  console.log(`curl -X POST 'http://localhost:${PORT}/api/messages/send' \\`);
  console.log(`  -H 'Content-Type: application/json' \\`);
  console.log(`  -H 'X-Agent-Passport-Id: ${AGENT_ID}' \\`);
  console.log(
    `  -d '{"channel": "general", "message_count": 5, "mentions": ["@user1"]}'`
  );

  console.log("\n4. Repository PR (Custom Context):");
  console.log(`curl -X POST 'http://localhost:${PORT}/api/repo/pr' \\`);
  console.log(`  -H 'Content-Type: application/json' \\`);
  console.log(`  -d '{"pr_size_kb": 50, "file_path": "src/main.js"}'`);
});

// ============================================================================
// SUMMARY: SIMPLE PATTERNS
// ============================================================================

/*
KEY PATTERNS:

✅ GLOBAL: Enforce one policy on all routes
   app.use(agentPassportMiddleware({ policyId: "finance.payment.refund.v1" }));

✅ EXPLICIT: Most secure, explicit agent ID
   app.post("/api/refunds", requirePolicy("finance.payment.refund.v1", AGENT_ID), handler);

✅ HEADER: Backward compatible, uses header
   app.post("/api/export", requirePolicy("data.export.create.v1"), handler);

✅ CONTEXT: Custom context for complex scenarios
   app.post("/api/pr", requirePolicyWithContext("code.repository.merge.v1", context, AGENT_ID), handler);

THAT'S IT! Simple, clear, and powerful policy enforcement.
*/
