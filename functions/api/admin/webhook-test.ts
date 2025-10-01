/**
 * Webhook testing endpoint for validating webhook configuration
 * POST /api/admin/webhook-test
 */

import { cors } from "../../utils/cors";
import {
  sendWebhook,
  createStatusChangePayload,
  WebhookConfig,
} from "../../utils/webhook";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";

/**
 * components:
 *   schemas:
 *     WebhookTestRequest:
 *       type: object
 *       required:
 *         - webhook_url
 *       properties:
 *         webhook_url:
 *           type: string
 *           format: uri
 *           description: URL of the webhook endpoint to test
 *           example: "https://webhook.site/unique-id"
 *         webhook_secret:
 *           type: string
 *           description: Secret key for webhook authentication (optional)
 *           example: "your-webhook-secret"
 *         test_agent_id:
 *           type: string
 *           description: Agent ID to use in test payload (optional)
 *           example: "test-agent-webhook"
 *     WebhookTestResult:
 *       type: object
 *       required:
 *         - success
 *         - attempt
 *       properties:
 *         success:
 *           type: boolean
 *           description: Whether the webhook was sent successfully
 *           example: true
 *         attempt:
 *           type: number
 *           description: Number of attempts made
 *           example: 1
 *         error:
 *           type: string
 *           nullable: true
 *           description: Error message if webhook failed
 *           example: null
 *         response_status:
 *           type: number
 *           nullable: true
 *           description: HTTP status code received from webhook endpoint
 *           example: 200
 *         response_time_ms:
 *           type: number
 *           nullable: true
 *           description: Response time in milliseconds
 *           example: 150
 *         total_time_ms:
 *           type: number
 *           description: Total time for the test in milliseconds
 *           example: 200
 *     WebhookTestResponse:
 *       type: object
 *       required:
 *         - ok
 *         - test_url
 *         - test_payload
 *         - result
 *         - message
 *       properties:
 *         ok:
 *           type: boolean
 *           description: Overall test success status
 *           example: true
 *         test_url:
 *           type: string
 *           description: URL that was tested
 *           example: "https://webhook.site/unique-id"
 *         test_payload:
 *           type: object
 *           description: Payload that was sent to the webhook
 *           example:
 *             agent_id: "test-agent-webhook"
 *             status: "suspended"
 *             previous_status: "active"
 *             timestamp: "2024-01-15T10:30:00Z"
 *         result:
 *           $ref: '#/components/schemas/WebhookTestResult'
 *         message:
 *           type: string
 *           description: Human-readable test result message
 *           example: "Webhook test successful"
 */

interface Env {
  ai_passport_registry: KVNamespace;
  ADMIN_TOKEN: string;
  WEBHOOK_URL?: string;
  WEBHOOK_SECRET?: string;
}

interface WebhookTestRequest {
  webhook_url: string;
  webhook_secret?: string;
  test_agent_id?: string;
}

/**
 * /api/admin/webhook-test:
 *   post:
 *     summary: Test webhook configuration
 *     description: Send a test webhook to validate webhook endpoint configuration (admin only)
 *     operationId: testWebhook
 *     tags:
 *       - Admin
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WebhookTestRequest'
 *           example:
 *             webhook_url: "https://webhook.site/unique-id"
 *             webhook_secret: "your-webhook-secret"
 *             test_agent_id: "test-agent-webhook"
 *     responses:
 *       200:
 *         description: Webhook test completed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebhookTestResponse'
 *             example:
 *               ok: true
 *               test_url: "https://webhook.site/unique-id"
 *               test_payload:
 *                 agent_id: "test-agent-webhook"
 *                 status: "suspended"
 *                 previous_status: "active"
 *                 timestamp: "2024-01-15T10:30:00Z"
 *               result:
 *                 success: true
 *                 attempt: 1
 *                 error: null
 *                 response_status: 200
 *                 response_time_ms: 150
 *                 total_time_ms: 200
 *               message: "Webhook test successful"
 *       400:
 *         description: Invalid request data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               missing_url:
 *                 summary: Missing webhook URL
 *                 value:
 *                   error: "bad_request"
 *                   message: "Missing required field: webhook_url"
 *               invalid_url:
 *                 summary: Invalid URL format
 *                 value:
 *                   error: "bad_request"
 *                   message: "Invalid webhook URL format"
 *               invalid_json:
 *                 summary: Invalid JSON
 *                 value:
 *                   error: "bad_request"
 *                   message: "Invalid JSON in request body"
 *       401:
 *         description: Unauthorized - invalid admin token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "unauthorized"
 *               message: "Invalid or missing admin token"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "internal_server_error"
 *               message: "Webhook test failed"
 */
export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const headers = cors(request);

  // Authentication check
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env.ADMIN_TOKEN}`) {
    return new Response(
      JSON.stringify({
        error: "unauthorized",
        message: "Invalid or missing admin token",
      }),
      {
        status: 401,
        headers: { "content-type": "application/json", ...headers },
      }
    );
  }

  // Parse and validate request body
  let body: WebhookTestRequest;
  try {
    body = await request.json();
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "bad_request",
        message: "Invalid JSON in request body",
      }),
      {
        status: 400,
        headers: { "content-type": "application/json", ...headers },
      }
    );
  }

  const { webhook_url, webhook_secret, test_agent_id } = body;

  // Validate required fields
  if (!webhook_url) {
    return new Response(
      JSON.stringify({
        error: "bad_request",
        message: "Missing required field: webhook_url",
      }),
      {
        status: 400,
        headers: { "content-type": "application/json", ...headers },
      }
    );
  }

  // Validate URL format
  try {
    new URL(webhook_url);
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "bad_request",
        message: "Invalid webhook URL format",
      }),
      {
        status: 400,
        headers: { "content-type": "application/json", ...headers },
      }
    );
  }

  // Create test payload
  const testAgentId = test_agent_id || "test-agent-webhook";
  const testPayload = createStatusChangePayload(
    testAgentId,
    "suspended",
    "active",
    new Date().toISOString()
  );

  // Configure webhook
  const webhookConfig: WebhookConfig = {
    url: webhook_url,
    secret: webhook_secret,
    retry_attempts: 1, // Only 1 attempt for testing
    retry_delay_ms: 1000,
    timeout_ms: 5000,
  };

  // Send test webhook
  const startTime = Date.now();
  const result = await sendWebhook(webhookConfig, testPayload);
  const responseTime = Date.now() - startTime;

  return new Response(
    JSON.stringify({
      ok: true,
      test_url: webhook_url,
      test_payload: testPayload,
      result: {
        success: result.success,
        attempt: result.attempt,
        error: result.error,
        response_status: result.response_status,
        response_time_ms: result.response_time_ms,
        total_time_ms: responseTime,
      },
      message: result.success
        ? "Webhook test successful"
        : "Webhook test failed - check your endpoint",
    }),
    {
      status: 200,
      headers: { "content-type": "application/json", ...headers },
    }
  );
};
