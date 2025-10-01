import { cors } from "../../../utils/cors";
import { createLogger } from "../../../utils/logger";
import { authMiddleware } from "../../../utils/auth-middleware";
import { BaseApiHandler } from "../../../utils/base-api-handler";
import {
  WebhookTestRequest,
  WebhookTestResponse,
  WebhookConfig,
} from "../../../../types/webhook";
import { testWebhook } from "../../../utils/webhook";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";

interface Env {
  ai_passport_registry: KVNamespace;
  JWT_SECRET: string;
}

/**
 * @swagger
 * /api/webhooks/{webhook_id}/test:
 *   post:
 *     summary: Test webhook endpoint
 *     description: Send a test ping to the webhook endpoint
 *     operationId: testWebhook
 *     tags:
 *       - Webhooks
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: webhook_id
 *         in: path
 *         required: true
 *         description: The webhook ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event_type:
 *                 type: string
 *                 enum: [status.changed, passport.updated, assurance.updated, attestation.created, attestation.verified, instance.created, instance.suspended]
 *                 description: Event type to test with
 *     responses:
 *       200:
 *         description: Test result
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebhookTestResponse'
 *       404:
 *         description: Webhook not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

class TestWebhookHandler extends BaseApiHandler {
  private getPathParam(name: string): string | null {
    const url = new URL(this.request.url);
    const pathParts = url.pathname.split("/");
    const webhookIndex = pathParts.indexOf("webhooks");
    if (webhookIndex !== -1 && pathParts[webhookIndex + 1]) {
      return pathParts[webhookIndex + 1];
    }
    return null;
  }

  private async getJsonBody<T>(): Promise<T | null> {
    try {
      return await this.request.json();
    } catch (error) {
      return null;
    }
  }

  async handleRequest(): Promise<Response> {
    const webhookId = this.getPathParam("webhook_id");
    if (!webhookId) {
      return this.badRequest("Webhook ID is required");
    }

    const body = await this.getJsonBody<WebhookTestRequest>();
    const eventType = body?.event_type || "status.changed";

    try {
      const webhookKey = `webhook:${webhookId}`;
      const webhookData = await this.env.ai_passport_registry.get(
        webhookKey,
        "json"
      );

      if (!webhookData) {
        return this.notFound("Webhook not found");
      }

      const webhook = webhookData as WebhookConfig;

      // Test the webhook
      const testConfig = {
        url: webhook.url,
        secret: webhook.secret,
        retry_attempts: webhook.retry_attempts,
        timeout_ms: webhook.timeout_ms,
      };

      const result = await testWebhook(testConfig, eventType);

      const response: WebhookTestResponse = {
        success: result.success,
        response_status: result.response_status,
        response_time_ms: result.response_time_ms,
        error: result.error,
        attempt: result.attempt,
      };

      return new Response(JSON.stringify(response), {
        headers: {
          "content-type": "application/json",
          ...cors(this.request),
        },
      });
    } catch (error) {
      console.error("Error testing webhook:", error);
      return this.internalError("Failed to test webhook");
    }
  }
}

// Export handlers
export const onRequestOptions: PagesFunction<Env> = async ({ request }) => {
  return new Response(null, {
    status: 200,
    headers: cors(request),
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const handler = new TestWebhookHandler(request, env, {
    allowedMethods: ["POST"],
    requireAuth: true,
    rateLimitRpm: 10,
    rateLimitType: "org",
  });
  return handler.execute();
};
