/**
 * Standard Agent Passport Middleware Example
 *
 * This shows the proper standard middleware approach where agent ID and context
 * are explicitly passed rather than extracted from headers.
 */

const express = require("express");
const {
  createAgentPassportMiddleware,
  requirePolicy,
  requirePolicyWithContext,
  agentPassportMiddleware,
} = require("@aporthq/middleware-express");

const app = express();
app.use(express.json());

// ============================================================================
// APPROACH 1: EXPLICIT AGENT ID IN MIDDLEWARE CREATION
// ============================================================================

/**
 * This is the most explicit and standard approach.
 * Agent ID is passed when creating the middleware.
 */

// Create middleware with explicit agent ID
const AGENT_ID = "agents/ap_a2d10232c6534523812423eec8a1425c"; // Your existing agent ID
const refundsMiddleware1 = createAgentPassportMiddleware(AGENT_ID, {
  apiBaseUrl: process.env.APORT_API_BASE_URL || "https://api.aport.io",
  failClosed: true,
  cacheTtl: 60,
});

// Apply middleware to specific routes
app.post(
  "/api/refunds",
  (req, res, next) => {
    // Set policy ID for this route
    req.policyId = "finance.payment.refund.v1";
    next();
  },
  refundsMiddleware1,
  (req, res) => {
    // Your business logic - policy already verified!
    res.json({
      success: true,
      refund_id: "ref_" + Date.now(),
      message: "Refund processed successfully",
    });
  }
);

// ============================================================================
// APPROACH 2: CONVENIENCE FUNCTION WITH EXPLICIT AGENT ID
// ============================================================================

/**
 * This approach uses the convenience function that takes agent ID explicitly.
 */

app.post(
  "/api/data/export",
  requirePolicy("data.export.create.v1", AGENT_ID), // ← Agent ID passed explicitly
  (req, res) => {
    // Your business logic - policy already verified!
    res.json({
      success: true,
      export_id: "exp_" + Date.now(),
      message: "Data export created successfully",
    });
  }
);

// ============================================================================
// APPROACH 3: CONTEXT FROM BUSINESS LOGIC
// ============================================================================

/**
 * This approach shows how to pass context from your business logic
 * rather than relying on request body.
 */

app.post(
  "/api/repo/pr",
  (req, res, next) => {
    // Extract context from your business logic
    const context = {
      repository: req.body.repository,
      base_branch: req.body.base_branch,
      pr_size_kb: req.body.pr_size_kb,
      file_path: req.body.file_path,
      requires_review: req.body.requires_review,
    };

    // Use convenience function with explicit context
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

// ============================================================================
// APPROACH 4: GLOBAL MIDDLEWARE WITH EXPLICIT AGENT ID
// ============================================================================

/**
 * This approach applies middleware globally but only when policy ID is set.
 */

// Apply global middleware
app.use(
  agentPassportMiddleware(AGENT_ID, {
    apiBaseUrl: process.env.APORT_API_BASE_URL || "https://api.aport.io",
    failClosed: true,
    cacheTtl: 60,
  })
);

// Routes that need policy enforcement
app.post(
  "/api/messages/send",
  (req, res, next) => {
    // Set policy ID for this route
    req.policyId = "messaging.message.send.v1";
    next();
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

// Routes that don't need policy enforcement
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ============================================================================
// APPROACH 5: MULTIPLE AGENTS (ADVANCED)
// ============================================================================

/**
 * This approach shows how to handle multiple agents in the same application.
 */

// Different agents for different purposes
const REFUNDS_AGENT_ID = "agents/ap_a2d10232c6534523812423eec8a1425c";
const DATA_AGENT_ID = "agents/ap_a2d10232c6534523812423eec8a1425c";
const REPO_AGENT_ID = "agents/ap_a2d10232c6534523812423eec8a1425c";

// Create separate middleware for each agent
const refundsMiddleware2 = createAgentPassportMiddleware(REFUNDS_AGENT_ID);
const dataMiddleware = createAgentPassportMiddleware(DATA_AGENT_ID);
const repoMiddleware = createAgentPassportMiddleware(REPO_AGENT_ID);

// Apply different agents to different routes
app.post(
  "/api/refunds",
  (req, res, next) => {
    req.policyId = "finance.payment.refund.v1";
    next();
  },
  refundsMiddleware2,
  (req, res) => res.json({ success: true, refund_id: "ref_" + Date.now() })
);

app.post(
  "/api/data/export",
  (req, res, next) => {
    req.policyId = "data.export.create.v1";
    next();
  },
  dataMiddleware,
  (req, res) => res.json({ success: true, export_id: "exp_" + Date.now() })
);

app.post(
  "/api/repo/pr",
  (req, res, next) => {
    req.policyId = "code.repository.merge.v1";
    next();
  },
  repoMiddleware,
  (req, res) => res.json({ success: true, pr_id: "pr_" + Date.now() })
);

// ============================================================================
// APPROACH 6: DYNAMIC AGENT ID (ADVANCED)
// ============================================================================

/**
 * This approach shows how to determine agent ID dynamically based on request context.
 */

function getAgentIdForRequest(req) {
  // Determine agent ID based on request context
  const tenantId = req.headers["x-tenant-id"];
  const userType = req.headers["x-user-type"];

  // Return appropriate agent ID based on context
  if (tenantId === "tenant_1")
    return "agents/ap_a2d10232c6534523812423eec8a1425c";
  if (tenantId === "tenant_2")
    return "agents/ap_a2d10232c6534523812423eec8a1425c";
  if (userType === "admin") return "agents/ap_a2d10232c6534523812423eec8a1425c";

  // Default agent ID
  return "agents/ap_a2d10232c6534523812423eec8a1425c";
}

app.post(
  "/api/dynamic/refunds",
  (req, res, next) => {
    // Get agent ID dynamically
    const agentId = getAgentIdForRequest(req);

    // Set policy ID and agent ID
    req.policyId = "finance.payment.refund.v1";
    req.agentId = agentId;

    // Create middleware with dynamic agent ID
    const middleware = createAgentPassportMiddleware(agentId);
    return middleware(req, res, next);
  },
  (req, res) => {
    // Your business logic - policy already verified!
    res.json({
      success: true,
      refund_id: "ref_" + Date.now(),
      agent_id: req.agentId,
      message: "Refund processed successfully",
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

  console.log(`\n1. Refunds:`);
  console.log(`curl -X POST http://localhost:${PORT}/api/refunds \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"amount": 25.00, "currency": "USD"}'`);

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
  console.log(`  -d '{"channel": "general", "message_count": 5}'`);

  console.log(`\n5. Dynamic Agent ID:`);
  console.log(`curl -X POST http://localhost:${PORT}/api/dynamic/refunds \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -H "X-Tenant-ID: tenant_1" \\`);
  console.log(`  -d '{"amount": 25.00}'`);
});

// ============================================================================
// SUMMARY: STANDARD MIDDLEWARE APPROACH
// ============================================================================

/**
 * KEY IMPROVEMENTS:
 *
 * ✅ EXPLICIT AGENT ID: Passed when creating middleware, not extracted from headers
 * ✅ EXPLICIT CONTEXT: Passed from business logic, not from request body
 * ✅ STANDARD PATTERNS: Follows Express.js middleware conventions
 * ✅ FLEXIBLE: Multiple approaches for different use cases
 * ✅ CLEAR: No magic header extraction or hidden behavior
 *
 * APPROACHES:
 * 1. createAgentPassportMiddleware(agentId) - Most explicit
 * 2. requirePolicy(policyId, agentId) - Convenience function
 * 3. requirePolicyWithContext(policyId, agentId, context) - With explicit context
 * 4. agentPassportMiddleware(agentId) - Global middleware
 * 5. Multiple agents - Different agents for different routes
 * 6. Dynamic agent ID - Determine agent ID based on request context
 *
 * BENEFITS:
 * - No dependency on headers
 * - Context comes from business logic
 * - Follows standard middleware patterns
 * - More explicit and clear
 * - Easier to test and debug
 * - More flexible and configurable
 */
