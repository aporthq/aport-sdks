import { cors } from "../../../utils/cors";
import { createLogger } from "../../../utils/logger";
import { authMiddleware } from "../../../utils/auth-middleware";
import { BaseApiHandler } from "../../../utils/base-api-handler";
import { generateSecureToken } from "../../../utils/auth";
import {
  CreateWebhookRequest,
  UpdateWebhookRequest,
  WebhookConfig,
  WebhookListResponse,
  WebhookTestRequest,
  WebhookTestResponse,
  WebhookSecretRotateResponse,
} from "../../../../types/webhook";
import { testWebhook } from "../../../utils/webhook";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";

interface Env {
  ai_passport_registry: KVNamespace;
  JWT_SECRET: string;
}

/**
 * @swagger
 * /api/passports/{template_id}/webhooks:
 *   post:
 *     summary: Create agent passport-specific webhook
 *     description: Register a webhook endpoint for a specific agent/passport
 *     operationId: createAgentWebhook
 *     tags:
 *       - Webhooks
 *       - Passports
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: template_id
 *         in: path
 *         required: true
 *         description: The agent/passport ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *               - secret
 *               - events
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *                 description: The webhook endpoint URL
 *               secret:
 *                 type: string
 *                 description: Secret for signing webhook payloads
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [status.changed, passport.updated, assurance.updated, attestation.created, attestation.verified, instance.created, instance.suspended]
 *                 description: List of events to subscribe to
 *               active:
 *                 type: boolean
 *                 default: true
 *                 description: Whether the webhook is active
 *               retry_attempts:
 *                 type: integer
 *                 default: 3
 *                 minimum: 1
 *                 maximum: 10
 *                 description: Number of retry attempts
 *               timeout_ms:
 *                 type: integer
 *                 default: 5000
 *                 minimum: 1000
 *                 maximum: 30000
 *                 description: Request timeout in milliseconds
 *     responses:
 *       201:
 *         description: Webhook created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 webhook:
 *                   $ref: '#/components/schemas/WebhookConfig'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Agent not found
 *       500:
 *         description: Internal server error
 *   get:
 *     summary: List agent webhooks
 *     description: Get all webhooks for a specific agent
 *     operationId: listAgentWebhooks
 *     tags:
 *       - Webhooks
 *       - Passports
 *     parameters:
 *       - name: template_id
 *         in: path
 *         required: true
 *         description: The agent/passport ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of webhooks
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebhookListResponse'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Agent not found
 *       500:
 *         description: Internal server error
 */

class CreateAgentWebhookHandler extends BaseApiHandler {
  private getPathParam(name: string): string | null {
    const url = new URL(this.request.url);
    const pathParts = url.pathname.split("/");
    const templateIndex = pathParts.indexOf("passports");
    if (templateIndex !== -1 && pathParts[templateIndex + 1]) {
      return pathParts[templateIndex + 1];
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
    const agentId = this.getPathParam("template_id");
    if (!agentId) {
      return this.badRequest("Agent ID is required");
    }

    const body = await this.getJsonBody<
      Omit<CreateWebhookRequest, "target" | "target_id" | "agent_id">
    >();
    if (!body) {
      return this.badRequest("Request body is required");
    }

    // Validate required fields
    if (!body.url || !body.secret || !body.events) {
      return this.badRequest("Missing required fields: url, secret, events");
    }

    if (!Array.isArray(body.events) || body.events.length === 0) {
      return this.badRequest("Events must be a non-empty array");
    }

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

    try {
      // Verify agent exists
      const agentKey = `passport:${agentId}`;
      const agentData = await this.env.ai_passport_registry.get(
        agentKey,
        "json"
      );
      if (!agentData) {
        return this.notFound("Agent not found");
      }

      const webhookId = `wh_${generateSecureToken(16)}`;
      const now = new Date().toISOString();

      const webhook: WebhookConfig = {
        webhook_id: webhookId,
        target: "agent",
        target_id: agentId,
        agent_id: agentId,
        url: body.url,
        secret: body.secret,
        events: body.events,
        active: body.active ?? true,
        created_at: now,
        updated_at: now,
        failure_count: 0,
        retry_attempts: body.retry_attempts ?? 3,
        timeout_ms: body.timeout_ms ?? 5000,
      };

      // Store webhook
      const webhookKey = `webhook:${webhookId}`;
      await this.env.ai_passport_registry.put(
        webhookKey,
        JSON.stringify(webhook)
      );

      // Add to agent index
      const agentIndexKey = `webhooks:agent:${agentId}`;
      const existingWebhooks =
        ((await this.env.ai_passport_registry.get(
          agentIndexKey,
          "json"
        )) as string[]) || [];
      await this.env.ai_passport_registry.put(
        agentIndexKey,
        JSON.stringify([...existingWebhooks, webhookId])
      );

      return this.created(
        {
          message: "Webhook created successfully",
          webhook,
        },
        "Webhook created successfully"
      );
    } catch (error) {
      console.error("Error creating agent webhook:", error);
      return this.internalError("Failed to create webhook");
    }
  }
}

class ListAgentWebhooksHandler extends BaseApiHandler {
  private getPathParam(name: string): string | null {
    const url = new URL(this.request.url);
    const pathParts = url.pathname.split("/");
    const templateIndex = pathParts.indexOf("passports");
    if (templateIndex !== -1 && pathParts[templateIndex + 1]) {
      return pathParts[templateIndex + 1];
    }
    return null;
  }

  async handleRequest(): Promise<Response> {
    const agentId = this.getPathParam("template_id");
    if (!agentId) {
      return this.badRequest("Agent ID is required");
    }

    try {
      // Verify agent exists
      const agentKey = `passport:${agentId}`;
      const agentData = await this.env.ai_passport_registry.get(
        agentKey,
        "json"
      );
      if (!agentData) {
        return this.notFound("Agent not found");
      }

      // Get agent-specific webhooks
      const agentIndexKey = `webhooks:agent:${agentId}`;
      const webhookIds =
        ((await this.env.ai_passport_registry.get(
          agentIndexKey,
          "json"
        )) as string[]) || [];

      const webhooks: WebhookConfig[] = [];
      for (const webhookId of webhookIds) {
        const webhookKey = `webhook:${webhookId}`;
        const webhookData = await this.env.ai_passport_registry.get(
          webhookKey,
          "json"
        );
        if (webhookData) {
          webhooks.push(webhookData as WebhookConfig);
        }
      }

      const response: WebhookListResponse = {
        webhooks,
        total: webhooks.length,
      };

      return new Response(JSON.stringify(response), {
        headers: {
          "content-type": "application/json",
          ...cors(this.request),
        },
      });
    } catch (error) {
      console.error("Error listing agent webhooks:", error);
      return this.internalError("Failed to list webhooks");
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
  const handler = new CreateAgentWebhookHandler(request, env, {
    allowedMethods: ["POST"],
    requireAuth: true,
    rateLimitRpm: 30,
    rateLimitType: "org",
  });
  return handler.execute();
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const handler = new ListAgentWebhooksHandler(request, env, {
    allowedMethods: ["GET"],
    requireAuth: true,
    rateLimitRpm: 60,
    rateLimitType: "org",
  });
  return handler.execute();
};
