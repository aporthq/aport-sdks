import { cors } from "../../utils/cors";
import { createLogger } from "../../utils/logger";
import { authMiddleware } from "../../utils/auth-middleware";
import { BaseApiHandler } from "../../utils/base-api-handler";
import { generateSecureToken } from "../../utils/auth";
import {
  UpdateWebhookRequest,
  WebhookConfig,
  WebhookTestRequest,
  WebhookTestResponse,
  WebhookSecretRotateResponse,
} from "../../../types/webhook";
import { testWebhook } from "../../utils/webhook";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";

interface Env {
  ai_passport_registry: KVNamespace;
  JWT_SECRET: string;
}

/**
 * @swagger
 * /api/webhooks/{webhook_id}:
 *   get:
 *     summary: Get webhook details
 *     description: Get details of a specific webhook
 *     operationId: getWebhook
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
 *         description: Webhook details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebhookConfig'
 *       404:
 *         description: Webhook not found
 *       401:
 *         description: Unauthorized
 *   put:
 *     summary: Update webhook
 *     description: Update webhook configuration
 *     operationId: updateWebhook
 *     tags:
 *       - Webhooks
 *     parameters:
 *       - name: webhook_id
 *         in: path
 *         required: true
 *         description: The webhook ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *               secret:
 *                 type: string
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *               active:
 *                 type: boolean
 *               retry_attempts:
 *                 type: integer
 *               timeout_ms:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Webhook updated successfully
 *       404:
 *         description: Webhook not found
 *       401:
 *         description: Unauthorized
 *   delete:
 *     summary: Delete webhook
 *     description: Delete a webhook
 *     operationId: deleteWebhook
 *     tags:
 *       - Webhooks
 *     parameters:
 *       - name: webhook_id
 *         in: path
 *         required: true
 *         description: The webhook ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Webhook deleted successfully
 *       404:
 *         description: Webhook not found
 *       401:
 *         description: Unauthorized
 */

class GetWebhookHandler extends BaseApiHandler {
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

      return new Response(JSON.stringify(webhook), {
        headers: {
          "content-type": "application/json",
          ...cors(this.request),
        },
      });
    } catch (error) {
      console.error("Error getting webhook:", error);
      return this.internalError("Failed to get webhook");
    }
  }
}

class UpdateWebhookHandler extends BaseApiHandler {
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

    const body = await this.getJsonBody<UpdateWebhookRequest>();
    if (!body) {
      return this.badRequest("Request body is required");
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

      // Validate events if provided
      if (body.events) {
        const validEvents = [
          "status.changed",
          "passport.updated",
          "assurance.updated",
          "attestation.created",
          "attestation.verified",
          "instance.created",
          "instance.suspended",
        ];

        for (const event of body.events) {
          if (!validEvents.includes(event)) {
            return this.badRequest(`Invalid event type: ${event}`);
          }
        }
      }

      // Update webhook
      const updatedWebhook: WebhookConfig = {
        ...webhook,
        ...body,
        updated_at: new Date().toISOString(),
      };

      await this.env.ai_passport_registry.put(
        webhookKey,
        JSON.stringify(updatedWebhook)
      );

      return new Response(
        JSON.stringify({
          ok: true,
          message: "Webhook updated successfully",
          webhook: updatedWebhook,
        }),
        {
          headers: {
            "content-type": "application/json",
            ...cors(this.request),
          },
        }
      );
    } catch (error) {
      console.error("Error updating webhook:", error);
      return this.internalError("Failed to update webhook");
    }
  }
}

class DeleteWebhookHandler extends BaseApiHandler {
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

      // Delete webhook
      await this.env.ai_passport_registry.delete(webhookKey);

      // Remove from target index
      const targetIndexKey = `webhooks:${webhook.target}:${webhook.target_id}`;
      const existingWebhooks =
        ((await this.env.ai_passport_registry.get(
          targetIndexKey,
          "json"
        )) as string[]) || [];
      const updatedWebhooks = existingWebhooks.filter((id) => id !== webhookId);
      await this.env.ai_passport_registry.put(
        targetIndexKey,
        JSON.stringify(updatedWebhooks)
      );

      // Remove from agent index if applicable
      if (webhook.agent_id) {
        const agentIndexKey = `webhooks:agent:${webhook.agent_id}`;
        const existingAgentWebhooks =
          ((await this.env.ai_passport_registry.get(
            agentIndexKey,
            "json"
          )) as string[]) || [];
        const updatedAgentWebhooks = existingAgentWebhooks.filter(
          (id) => id !== webhookId
        );
        await this.env.ai_passport_registry.put(
          agentIndexKey,
          JSON.stringify(updatedAgentWebhooks)
        );
      }

      return new Response(
        JSON.stringify({
          ok: true,
          message: "Webhook deleted successfully",
        }),
        {
          headers: {
            "content-type": "application/json",
            ...cors(this.request),
          },
        }
      );
    } catch (error) {
      console.error("Error deleting webhook:", error);
      return this.internalError("Failed to delete webhook");
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

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const handler = new GetWebhookHandler(request, env, {
    allowedMethods: ["GET"],
    requireAuth: true,
    rateLimitRpm: 60,
    rateLimitType: "org",
  });
  return handler.execute();
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const handler = new UpdateWebhookHandler(request, env, {
    allowedMethods: ["PUT"],
    requireAuth: true,
    rateLimitRpm: 30,
    rateLimitType: "org",
  });
  return handler.execute();
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const handler = new DeleteWebhookHandler(request, env, {
    allowedMethods: ["DELETE"],
    requireAuth: true,
    rateLimitRpm: 30,
    rateLimitType: "org",
  });
  return handler.execute();
};
