/**
 * Complete Agent Passport Integration Example
 *
 * This shows the complete flow from having an agent ID to protecting endpoints
 * with policy enforcement. Perfect for integrators who already have an agent ID.
 */

const express = require("express");
const { requirePolicy } = require("@aporthq/middleware-express");

const app = express();
app.use(express.json());

// ============================================================================
// STEP 1: CONFIGURE MIDDLEWARE (1 minute)
// ============================================================================

// Your existing agent ID
const AGENT_ID = "agents/ap_a2d10232c6534523812423eec8a1425c";

// ============================================================================
// STEP 2: UNDERSTAND THE FLOW (2 minutes)
// ============================================================================

/**
 * COMPLETE FLOW:
 *
 * 1. AGENT ID: Passed explicitly when creating middleware
 * 2. POLICY ID: Specified in the route
 * 3. CONTEXT: Comes from your business logic, not headers
 * 4. VERIFICATION: Middleware calls Agent Passport API
 * 5. ENFORCEMENT: Policy rules applied based on agent capabilities/limits
 * 6. DECISION: Request allowed/blocked based on verification result
 * 7. BUSINESS LOGIC: Runs only if verification passes
 */

// ============================================================================
// STEP 3: PROTECT YOUR ENDPOINTS (3 minutes)
// ============================================================================

/**
 * BEFORE: Manual verification (what you had to do before)
 */
app.post("/api/refunds/manual", async (req, res) => {
  // ❌ All this manual work...
  const agentId = req.header("X-Agent-Passport-Id");
  if (!agentId) return res.status(400).json({ error: "missing agent id" });

  const ctx = {
    amount: req.body.amount, // Amount in cents
    currency: req.body.currency || "USD",
  };

  const r = await fetch(
    `${
      process.env.APORT_API_BASE_URL || "https://api.aport.io"
    }/api/verify/policy/finance.payment.refund.v1`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: agentId, context: ctx }),
    }
  ).then((r) => r.json());

  if (!r.allow)
    return res.status(403).json({
      error: "denied",
      reason: r.reason,
      violations: r.violations,
    });

  // Your business logic here...
  res.json({ success: true, refund_id: "ref_" + Date.now() });
});

/**
 * AFTER: Just use middleware (1 line!)
 */
app.post(
  "/api/refunds",
  requirePolicy("finance.payment.refund.v1", AGENT_ID), // ← Agent ID passed explicitly!
  async (req, res) => {
    // Your business logic - policy is already verified!
    // Agent ID is explicitly passed and validated
    // Context validation is automatically applied

    // Additional security: Log suspicious activity
    if (req.policyResult?.evaluation?.suspicious) {
      console.warn("Suspicious refund activity detected:", {
        agent_id: AGENT_ID,
        context: req.body,
        reasons: req.policyResult.evaluation.suspiciousReasons,
      });
    }

    res.json({
      success: true,
      refund_id: req.policyResult?.refund_id || "ref_" + Date.now(),
      message: "Refund processed successfully",
      decision_id: req.policyResult?.evaluation?.decision_id,
      remaining_daily_cap: req.policyResult?.evaluation?.remaining_daily_cap,
    });
  }
);

// ============================================================================
// STEP 4: ADD MORE PROTECTED ENDPOINTS (2 minutes)
// ============================================================================

// Data export endpoint with PII validation
app.post(
  "/api/data/export",
  requirePolicy("data.export.create.v1", AGENT_ID),
  async (req, res) => {
    // Context validation automatically checks:
    // - Row limits (context.rows vs passport.limits.max_export_rows)
    // - PII access (context.contains_pii vs passport.limits.allow_pii)
    res.json({
      success: true,
      export_id: "exp_" + Date.now(),
      message: "Data export created successfully",
    });
  }
);

// Repository operations with comprehensive validation
app.post(
  "/api/repo/pr",
  requirePolicy("code.repository.merge.v1", AGENT_ID),
  async (req, res) => {
    // Context validation automatically checks:
    // - Repository access (context.repository vs passport.limits.allowed_repos)
    // - Base branch access (context.base_branch vs passport.limits.allowed_base_branches)
    // - PR size limits (context.pr_size_kb vs passport.limits.max_pr_size_kb)
    // - Path allowlist (context.file_path vs passport.limits.allowed_paths)
    // - Review requirements (context.requires_review vs passport.limits.requires_review)
    res.json({
      success: true,
      pr_id: "pr_" + Date.now(),
      message: "Pull request created successfully",
    });
  }
);

// Messaging endpoint with rate limiting
app.post(
  "/api/messages/send",
  requirePolicy("messaging.message.send.v1", AGENT_ID),
  async (req, res) => {
    // Context validation automatically checks:
    // - Channel access (context.channel vs passport.limits.allowed_channels)
    // - Rate limits (context.message_count vs passport.limits.msgs_per_min)
    // - Mention policy (context.mentions vs passport.limits.allow_everyone_mentions)
    res.json({
      success: true,
      message_id: "msg_" + Date.now(),
      message: "Message sent successfully",
    });
  }
);

// ============================================================================
// STEP 5: ERROR HANDLING (1 minute)
// ============================================================================

// Global error handler for policy violations
app.use((err, req, res, next) => {
  if (err.name === "PolicyViolationError") {
    return res.status(403).json({
      error: "policy_violation",
      message: err.message,
      violations: err.violations || [],
      agent_id: err.agent_id,
      policy_id: err.policy_id,
    });
  }
  next(err);
});

// ============================================================================
// STEP 6: TEST YOUR INTEGRATION (1 minute)
// ============================================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log("\n📋 HOW TO USE YOUR EXISTING AGENT ID:");
  console.log(
    "1. You already have an agent ID: agents/ap_a2d10232c6534523812423eec8a1425c"
  );
  console.log("2. Pass it explicitly to the middleware (no headers needed)");
  console.log(
    "3. The middleware will automatically verify and enforce policies"
  );

  console.log(
    "\n📋 Test your endpoints (no agent ID header needed - it's explicit in middleware):"
  );
  console.log(`\n1. Refunds:`);
  console.log(`curl -X POST http://localhost:${PORT}/api/refunds \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"amount": 2500, "currency": "USD"}'`); // $25.00 in cents

  console.log(`\n2. Data Export:`);
  console.log(`curl -X POST http://localhost:${PORT}/api/data/export \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"rows": 1000, "format": "json", "contains_pii": false}'`);

  console.log(`\n3. Repository PR:`);
  console.log(`curl -X POST http://localhost:${PORT}/api/repo/pr \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(
    `  -d '{"repository": "myorg/myrepo", "base_branch": "main", "pr_size_kb": 50}'`
  );

  console.log(`\n4. Messaging:`);
  console.log(`curl -X POST http://localhost:${PORT}/api/messages/send \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(
    `  -d '{"channel": "general", "message_count": 5, "mentions": ["@user1"]}'`
  );
});

// ============================================================================
// SUMMARY: COMPLETE INTEGRATION IN 6 MINUTES!
// ============================================================================

/**
 * What you get:
 *
 * ✅ Use your existing agent ID: "agents/ap_a2d10232c6534523812423eec8a1425c"
 * ✅ Automatic agent ID extraction from headers
 * ✅ Policy verification against Agent Passport API
 * ✅ Context-specific validation (amounts, limits, regions, etc.)
 * ✅ Comprehensive error handling
 * ✅ Caching for performance
 * ✅ Support for all policy types (refunds, data export, repo, messaging)
 * ✅ Zero manual verification code
 *
 * Agent ID Headers Supported:
 * - X-Agent-Passport-Id: agents/ap_a2d10232c6534523812423eec8a1425c (preferred)
 * - X-Agent-ID: agents/ap_a2d10232c6534523812423eec8a1425c (fallback)
 * - Authorization: Bearer agents/ap_a2d10232c6534523812423eec8a1425c (fallback)
 *
 * Context Validation:
 * - Amount limits (finance.payment.refund.v1)
 * - Row limits and PII access (data.export.create.v1)
 * - Repository, branch, size, path, and review requirements (code.repository.merge.v1)
 * - Channel access, rate limits, and mention policies (messaging.message.send.v1)
 *
 * That's it! Your existing agent ID is now fully protected with enterprise-grade
 * access control, validation, and policy enforcement.
 */
