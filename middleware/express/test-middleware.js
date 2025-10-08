/**
 * Simple test to verify Express middleware works with the updated SDK
 */

const express = require("express");
const { agentPassportMiddleware, requirePolicy } = require("./dist/index.js");

const app = express();
app.use(express.json());

// Test global middleware
app.use(
  agentPassportMiddleware({
    baseUrl: "https://api.aport.io",
    failClosed: false, // Don't fail for testing
    skipPaths: ["/health", "/test"],
  })
);

// Test route-specific middleware
app.post(
  "/api/refunds",
  requirePolicy("finance.payment.refund.v1", "test-agent-id"),
  (req, res) => {
    res.json({
      success: true,
      message: "Refund processed",
      agent_id: req.agent?.agent_id,
      policy_result: req.policyResult,
    });
  }
);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Test endpoint
app.get("/test", (req, res) => {
  res.json({ message: "Middleware test endpoint" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Express middleware test server running on port ${PORT}`);
  console.log("Test endpoints:");
  console.log(`  GET  http://localhost:${PORT}/health`);
  console.log(`  GET  http://localhost:${PORT}/test`);
  console.log(`  POST http://localhost:${PORT}/api/refunds`);
});
