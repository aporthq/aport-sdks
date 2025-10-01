import { cors } from "../utils/cors";
import { createLogger } from "../utils/logger";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";

interface Env {
  ai_passport_registry: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const headers = cors(request);
  const startTime = Date.now();

  // Initialize logger
  const logger = createLogger(env.ai_passport_registry);

  // Create a test log entry
  const testLog = {
    timestamp: Date.now(),
    route: "/api/test-logger",
    method: "GET",
    status: 200,
    latency: 50,
    clientIP: "127.0.0.1",
    userAgent: "test-agent",
    agentId: "test_agent",
  };

  console.log("Testing logger with entry:", testLog);

  try {
    // Test the logger directly (this will be filtered out by the logger)
    await logger.logRequest(
      request,
      new Response("OK", { status: 200 }),
      startTime,
      { agentId: "test_agent" }
    );

    // Check if log was stored
    const { keys } = await env.ai_passport_registry.list({ prefix: "log:" });
    console.log(`Found ${keys.length} log entries after test`);

    const response = new Response(
      JSON.stringify({
        success: true,
        logEntries: keys.length,
        testLog,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json", ...headers },
      }
    );

    return response;
  } catch (error) {
    console.error("Logger test failed:", error);

    const response = new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        testLog,
      }),
      {
        status: 500,
        headers: { "content-type": "application/json", ...headers },
      }
    );

    return response;
  }
};
