/**
 * Simple Standard Agent Passport Middleware Example
 *
 * This shows the simplest and most common way to use the middleware
 * with explicit agent ID and context from business logic.
 */

const express = require("express");
const {
  requirePolicy,
  requirePolicyWithContext,
} = require("@aporthq/middleware-express");

const app = express();
app.use(express.json());

// ============================================================================
// YOUR EXISTING AGENT ID
// ============================================================================

const AGENT_ID = "agents/ap_a2d10232c6534523812423eec8a1425c"; // Your existing agent ID

// ============================================================================
// SIMPLE APPROACH: CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * APPROACH 1: Basic policy enforcement
 * Context comes from request body automatically
 */
app.post(
  "/api/refunds",
  requirePolicy("finance.payment.refund.v1", AGENT_ID), // ← Agent ID passed explicitly
  (req, res) => {
    // Your business logic - policy already verified!
    // Context (amount, currency, region) comes from req.body automatically
    // Supports any valid ISO 4217 currency code and any region code

    const { amount_minor, currency, region, order_id, customer_id } = req.body;

    res.json({
      success: true,
      refund_id: req.policyResult?.refund_id || "ref_" + Date.now(),
      message: "Refund processed successfully",
      amount_minor,
      currency,
      region,
      order_id,
      customer_id,
      decision_id: req.policyResult?.evaluation?.decision_id,
      remaining_daily_cap: req.policyResult?.evaluation?.remaining_daily_cap,
    });
  }
);

/**
 * APPROACH 2: Explicit context from business logic
 * More control over what context is passed to policy
 */
app.post(
  "/api/data/export",
  (req, res, next) => {
    // Extract and prepare context from your business logic
    const context = {
      rows: req.body.rows,
      format: req.body.format,
      contains_pii: req.body.contains_pii,
      // Add any additional context your policy needs
      user_id: req.body.user_id,
      export_type: req.body.export_type,
    };

    // Use convenience function with explicit context
    return requirePolicyWithContext("data.export.create.v1", AGENT_ID, context)(
      req,
      res,
      next
    );
  },
  (req, res) => {
    // Your business logic - policy already verified!
    res.json({
      success: true,
      export_id: "exp_" + Date.now(),
      message: "Data export created successfully",
    });
  }
);

/**
 * APPROACH 3: Repository operations with comprehensive context
 */
app.post(
  "/api/repo/pr",
  (req, res, next) => {
    // Prepare context from your business logic
    const context = {
      repository: req.body.repository,
      base_branch: req.body.base_branch,
      pr_size_kb: req.body.pr_size_kb,
      file_path: req.body.file_path,
      requires_review: req.body.requires_review,
      // Add any additional context
      author: req.body.author,
      title: req.body.title,
    };

    return requirePolicyWithContext(
      "code.repository.merge.v1",
      AGENT_ID,
      context
    )(req, res, next);
  },
  (req, res) => {
    // Your business logic - policy already verified!
    res.json({
      success: true,
      pr_id: "pr_" + Date.now(),
      message: "Pull request created successfully",
    });
  }
);

/**
 * APPROACH 4: Messaging with rate limiting context
 */
app.post(
  "/api/messages/send",
  (req, res, next) => {
    // Prepare context from your business logic
    const context = {
      channel: req.body.channel,
      message_count: req.body.message_count,
      mentions: req.body.mentions,
      // Add any additional context
      user_id: req.body.user_id,
      message_type: req.body.message_type,
    };

    return requirePolicyWithContext(
      "messaging.message.send.v1",
      AGENT_ID,
      context
    )(req, res, next);
  },
  (req, res) => {
    // Your business logic - policy already verified!
    res.json({
      success: true,
      message_id: "msg_" + Date.now(),
      message: "Message sent successfully",
    });
  }
);

// ============================================================================
// ERROR HANDLING
// ============================================================================

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
// TESTING
// ============================================================================

const PORT = process.env.PORT || 8787;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`\n📋 Agent ID: ${AGENT_ID}`);
  console.log("\n📋 Test your endpoints:");

  console.log(`\n1. Refunds (context from request body):`);
  console.log(`curl -X POST http://localhost:${PORT}/api/refunds \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"amount": 25.00, "currency": "USD"}'`);

  console.log(`\n2. Data Export (explicit context):`);
  console.log(`curl -X POST http://localhost:${PORT}/api/data/export \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(
    `  -d '{"rows": 1000, "format": "json", "contains_pii": false, "user_id": "user123"}'`
  );

  console.log(`\n3. Repository PR (explicit context):`);
  console.log(`curl -X POST http://localhost:${PORT}/api/repo/pr \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(
    `  -d '{"repository": "myorg/myrepo", "base_branch": "main", "pr_size_kb": 50, "author": "dev123"}'`
  );

  console.log(`\n4. Messaging (explicit context):`);
  console.log(`curl -X POST http://localhost:${PORT}/api/messages/send \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(
    `  -d '{"channel": "general", "message_count": 5, "mentions": ["@user1"], "user_id": "user123"}'`
  );
});

// ============================================================================
// SUMMARY: SIMPLE STANDARD APPROACH
// ============================================================================

/**
 * KEY BENEFITS:
 *
 * ✅ EXPLICIT: Agent ID passed explicitly, no header extraction
 * ✅ CLEAR: Context comes from your business logic, not hidden
 * ✅ STANDARD: Follows Express.js middleware conventions
 * ✅ SIMPLE: Just two functions: requirePolicy() and requirePolicyWithContext()
 * ✅ FLEXIBLE: Can use request body or explicit context
 *
 * USAGE:
 *
 * 1. Basic (context from request body):
 *    app.post("/api/refunds", requirePolicy("finance.payment.refund.v1", AGENT_ID), handler)
 *
 * 2. Explicit context:
 *    app.post("/api/data/export",
 *      (req, res, next) => {
 *        const context = { rows: req.body.rows, contains_pii: req.body.contains_pii };
 *        return requirePolicyWithContext("data.export.create.v1", AGENT_ID, context)(req, res, next);
 *      },
 *      handler
 *    )
 *
 * THAT'S IT! No magic, no header extraction, just explicit and clear middleware.
 */
