/**
 * TypeScript Agent Passport Express Middleware Example
 *
 * Demonstrates type-safe policy enforcement with full TypeScript support.
 */

import express, { Request, Response } from "express";
import {
  agentPassportMiddleware,
  requirePolicy,
  requirePolicyWithContext,
  AgentRequest,
} from "@agent-passport/middleware-express";

const app = express();
app.use(express.json());

// ============================================================================
// CONFIGURATION
// ============================================================================

const AGENT_ID = "ap_a2d10232c6534523812423eec8a1425c45678"; // Your agent ID

// ============================================================================
// TYPE-SAFE ROUTE HANDLERS
// ============================================================================

/**
 * Refund processing with type-safe agent data access
 */
app.post(
  "/api/refunds",
  requirePolicy("finance.payment.refund.v1", AGENT_ID),
  (req: AgentRequest, res: Response) => {
    // Type-safe access to agent data
    const agentId = req.agent.agent_id;
    const assuranceLevel = req.agent.assurance_level;
    const capabilities = req.agent.capabilities;

    // Type-safe access to policy result
    const policyResult = req.policyResult;
    const decisionId = policyResult?.evaluation?.decision_id;

    const { amount, currency, order_id } = req.body;

    res.json({
      success: true,
      refund_id: `ref_${Date.now()}`,
      amount,
      currency,
      order_id,
      agent_id: agentId,
      assurance_level: assuranceLevel,
      capabilities: capabilities?.map((c) => c.id),
      decision_id: decisionId,
    });
  }
);

/**
 * Data export with type-safe validation
 */
app.post(
  "/api/data/export",
  requirePolicy("data.export.create.v1", AGENT_ID),
  (req: AgentRequest, res: Response) => {
    const { rows, format, contains_pii } = req.body;

    // Type-safe agent data
    const agentId = req.agent.agent_id;
    const limits = req.agent.limits;

    res.json({
      success: true,
      export_id: `exp_${Date.now()}`,
      rows,
      format,
      contains_pii,
      agent_id: agentId,
      max_rows: limits?.max_export_rows,
    });
  }
);

/**
 * Messaging with header fallback
 */
app.post(
  "/api/messages/send",
  requirePolicy("messaging.message.send.v1"), // Uses X-Agent-Passport-Id header
  (req: AgentRequest, res: Response) => {
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

/**
 * Repository operations with custom context
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
  (req: AgentRequest, res: Response) => {
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
// GLOBAL POLICY ENFORCEMENT
// ============================================================================

/**
 * Global middleware for all routes below
 */
app.use(
  agentPassportMiddleware({
    policyId: "finance.payment.refund.v1",
    failClosed: true,
  })
);

/**
 * All routes below require finance.payment.refund.v1 policy
 */
app.get("/api/refunds/history", (req: AgentRequest, res: Response) => {
  res.json({
    refunds: [],
    agent_id: req.agent.agent_id,
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((err: any, req: Request, res: Response, next: any) => {
  console.error("Error:", err);

  if (err.code === "policy_violation") {
    return res.status(403).json({
      error: "policy_violation",
      message: err.message,
      agent_id: err.agentId,
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

app.get("/health", (req: Request, res: Response) => {
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
  console.log(`🚀 TypeScript Agent Passport Server running on port ${PORT}`);
  console.log(`📋 Agent ID: ${AGENT_ID}`);
  console.log("\n📋 Test your endpoints:");
  console.log("\n1. Refunds:");
  console.log(`curl -X POST 'http://localhost:${PORT}/api/refunds' \\`);
  console.log(`  -H 'Content-Type: application/json' \\`);
  console.log(
    `  -d '{"amount": 25.00, "currency": "USD", "order_id": "order_123", "customer_id": "cust_456", "reason_code": "defective", "idempotency_key": "idem_789"}'`
  );

  console.log("\n2. Data Export:");
  console.log(`curl -X POST 'http://localhost:${PORT}/api/data/export' \\`);
  console.log(`  -H 'Content-Type: application/json' \\`);
  console.log(`  -d '{"rows": 1000, "format": "json", "contains_pii": false}'`);

  console.log("\n3. Messaging:");
  console.log(`curl -X POST 'http://localhost:${PORT}/api/messages/send' \\`);
  console.log(`  -H 'Content-Type: application/json' \\`);
  console.log(`  -H 'X-Agent-Passport-Id: ${AGENT_ID}' \\`);
  console.log(
    `  -d '{"channel": "general", "message_count": 5, "mentions": ["@user1"]}'`
  );
});

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Custom request body types for type safety
 */
interface RefundRequest {
  amount: number;
  currency: string;
  order_id: string;
  customer_id: string;
  reason_code: string;
  idempotency_key: string;
}

interface ExportRequest {
  rows: number;
  format: string;
  contains_pii: boolean;
}

interface MessageRequest {
  channel: string;
  message_count: number;
  mentions: string[];
}

interface PRRequest {
  pr_size_kb: number;
  file_path: string;
}

// ============================================================================
// SUMMARY: TYPESCRIPT BENEFITS
// ============================================================================

/*
TYPESCRIPT BENEFITS:

✅ TYPE SAFETY: Full type checking for agent data and policy results
✅ INTELLISENSE: Auto-completion for agent properties and methods
✅ COMPILE-TIME ERRORS: Catch errors before runtime
✅ REFACTORING: Safe renaming and restructuring
✅ DOCUMENTATION: Types serve as inline documentation

USAGE:
1. Import types: AgentRequest, PolicyResult, etc.
2. Use AgentRequest instead of Request for route handlers
3. Access req.agent and req.policyResult with full type safety
4. Get compile-time validation of agent data structure

THAT'S IT! Type-safe policy enforcement with full IDE support.
*/
