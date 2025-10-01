import { cors } from "../../../utils/cors";
import { createLogger } from "../../../utils/logger";
import { authMiddleware } from "../../../utils/auth-middleware";
import { BaseApiHandler } from "../../../utils/base-api-handler";
import { generateSecureToken } from "../../../utils/auth";
import {
  WebhookSecretRotateResponse,
  WebhookConfig,
} from "../../../../types/webhook";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";

interface Env {
  ai_passport_registry: KVNamespace;
  JWT_SECRET: string;
}

/**
 * @swagger
 * /api/webhooks/{webhook_id}/rotate:
 *   post:
 *     summary: Rotate webhook secret
 *     description: Generate a new secret for the webhook
 *     operationId: rotateWebhookSecret
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
 *     responses:
 *       200:
 *         description: Secret rotated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebhookSecretRotateResponse'
 *       404:
 *         description: Webhook not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

class RotateWebhookSecretHandler extends BaseApiHandler {
  private getPathParam(name: string): string | null {
    const url = new URL(this.request.url);
    const pathParts = url.pathname.split("/");
    const webhookIndex = pathParts.indexOf("webhooks");
    if (webhookIndex !== -1 && pathParts[webhookIndex + 1]) {
      return pathParts[webhookIndex + 1];
    }
    return null;
  }

  async handleRequest(): Promise<Response> {
    const webhookId = this.getPathParam("webhook_id");
    if (!webhookId) {
      return this.badRequest("Webhook ID is required");
    }

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

      // Generate new secret
      const newSecret = generateSecureToken(32);

      // Update webhook with new secret
      const updatedWebhook: WebhookConfig = {
        ...webhook,
        secret: newSecret,
        updated_at: new Date().toISOString(),
      };

      await this.env.ai_passport_registry.put(
        webhookKey,
        JSON.stringify(updatedWebhook)
      );

      const response: WebhookSecretRotateResponse = {
        new_secret: newSecret,
        webhook_id: webhookId,
      };

      return new Response(JSON.stringify(response), {
        headers: {
          "content-type": "application/json",
          ...cors(this.request),
        },
      });
    } catch (error) {
      console.error("Error rotating webhook secret:", error);
      return this.internalError("Failed to rotate webhook secret");
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
  const handler = new RotateWebhookSecretHandler(request, env, {
    allowedMethods: ["POST"],
    requireAuth: true,
    rateLimitRpm: 5,
    rateLimitType: "org",
  });
  return handler.execute();
};
