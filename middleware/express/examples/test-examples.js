#!/usr/bin/env node

/**
 * Test script for Policy Pack Express Examples
 *
 * This script demonstrates how to test the middleware examples.
 */

const fetch = require("node-fetch");

const BASE_URL = process.env.BASE_URL || "http://localhost:8787";

async function testStandardExample() {
  console.log("🧪 Testing Standard Middleware Example\n");
  console.log("=".repeat(60));

  const testData = {
    amount: 25.0,
    currency: "USD",
    reason: "test refund",
  };

  const headers = {
    "Content-Type": "application/json",
    "x-agent-passport-id": "agents/ap_a2d10232c6534523812423eec8a1425c",
  };

  // Test refunds endpoint (no agent ID header needed - it's explicit in middleware)
  console.log("\n1️⃣ Testing refunds endpoint");
  try {
    const response = await fetch(`${BASE_URL}/api/refunds`, {
      method: "POST",
      headers,
      body: JSON.stringify(testData),
    });

    const data = await response.json();
    console.log(`  Status: ${response.status}`);
    console.log(`  Success: ${data.success}`);
    console.log(`  Message: ${data.message}`);
    if (data.refund_id) {
      console.log(`  Refund ID: ${data.refund_id}`);
    }
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
  }

  // Test data export endpoint
  console.log("\n2️⃣ Testing data export endpoint");
  try {
    const response = await fetch(`${BASE_URL}/api/data/export`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        rows: 1000,
        format: "json",
        contains_pii: false,
        user_id: "user123",
      }),
    });

    const data = await response.json();
    console.log(`  Status: ${response.status}`);
    console.log(`  Success: ${data.success}`);
    console.log(`  Message: ${data.message}`);
    if (data.export_id) {
      console.log(`  Export ID: ${data.export_id}`);
    }
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
  }

  // Test repository PR endpoint
  console.log("\n3️⃣ Testing repository PR endpoint");
  try {
    const response = await fetch(`${BASE_URL}/api/repo/pr`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        repository: "myorg/myrepo",
        base_branch: "main",
        pr_size_kb: 50,
        author: "dev123",
      }),
    });

    const data = await response.json();
    console.log(`  Status: ${response.status}`);
    console.log(`  Success: ${data.success}`);
    console.log(`  Message: ${data.message}`);
    if (data.pr_id) {
      console.log(`  PR ID: ${data.pr_id}`);
    }
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
  }

  // Test messaging endpoint
  console.log("\n4️⃣ Testing messaging endpoint");
  try {
    const response = await fetch(`${BASE_URL}/api/messages/send`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        channel: "general",
        message_count: 5,
        mentions: ["@user1"],
        user_id: "user123",
      }),
    });

    const data = await response.json();
    console.log(`  Status: ${response.status}`);
    console.log(`  Success: ${data.success}`);
    console.log(`  Message: ${data.message}`);
    if (data.message_id) {
      console.log(`  Message ID: ${data.message_id}`);
    }
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("🏁 Standard middleware example tests completed!");
}

async function testHealth() {
  console.log("\n🔍 Testing server health");

  try {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();

    console.log("Health Status:", data.status);
    console.log("Message:", data.message);
  } catch (error) {
    console.log("❌ Health check failed:", error.message);
  }
}

async function testInfo() {
  console.log("\n📋 Getting server information");

  try {
    const response = await fetch(`${BASE_URL}/`);
    const data = await response.json();

    console.log("Title:", data.title);
    console.log("Description:", data.description);
    console.log("Available Endpoints:");
    data.endpoints.forEach((endpoint) => {
      console.log(`  ${endpoint}`);
    });
  } catch (error) {
    console.log("❌ Info request failed:", error.message);
  }
}

async function main() {
  console.log("🚀 Starting Standard Middleware Examples Test");
  console.log("Base URL:", BASE_URL);

  await testHealth();
  await testInfo();
  await testStandardExample();

  console.log("\n✨ All tests completed!");
  console.log("\n📚 Next steps:");
  console.log("1. Start the simple example: node simple-standard-example.js");
  console.log("2. Run this test script: node test-examples.js");
  console.log(
    "3. Try the complete example: node complete-integration-example.js"
  );
  console.log(
    "4. Try the advanced example: node standard-middleware-example.js"
  );
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testStandardExample, testHealth, testInfo };
