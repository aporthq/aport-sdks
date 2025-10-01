import { cors } from "../../utils/cors";
import { createLogger } from "../../utils/logger";
import { authMiddleware } from "../../utils/auth-middleware";
import { BaseApiHandler } from "../../utils/base-api-handler";
import { generateSecureToken } from "../../utils/auth";
import {
  CreateWebhookRequest,
  UpdateWebhookRequest,
  WebhookConfig,
  WebhookListResponse,
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
 * /api/webhooks:
 *   post:
 *     summary: Create a new webhook
 *     description: Register a webhook endpoint for receiving notifications
 *     operationId: createWebhook
 *     tags:
 *       - Webhooks
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               target:
 *                 type: string
 *                 enum: [user, org, agent]
 *                 description: The type of entity this webhook is for
 *               target_id:
 *                 type: string
 *                 description: The ID of the target entity
 *               agent_id:
 *                 type: string
 *                 description: Optional agent ID for agent-level overrides
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
 *             required:
 *               - target
 *               - target_id
 *               - url
 *               - secret
 *               - events
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
 *       500:
 *         description: Internal server error
 *   get:
 *     summary: List webhooks
 *     description: Get all webhooks for the authenticated user or organization
 *     operationId: listWebhooks
 *     tags:
 *       - Webhooks
 *     parameters:
 *       - name: target
 *         in: query
 *         required: false
 *         description: Filter by target type
 *         schema:
 *           type: string
 *           enum: [user, org, agent]
 *       - name: target_id
 *         in: query
 *         required: false
 *         description: Filter by target ID
 *         schema:
 *           type: string
 *       - name: agent_id
 *         in: query
 *         required: false
 *         description: Filter by agent ID
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
 *       500:
 *         description: Internal server error
 */

class CreateWebhookHandler extends BaseApiHandler {
  private async getJsonBody<T>(): Promise<T | null> {
    try {
      return await this.request.json();
    } catch (error) {
      return null;
    }
  }

  async handleRequest(): Promise<Response> {
    const body = await this.getJsonBody<CreateWebhookRequest>();
    if (!body) {
      return this.badRequest("Request body is required");
    }

    // Validate required fields
    if (
      !body.target ||
      !body.target_id ||
      !body.url ||
      !body.secret ||
      !body.events
    ) {
      return this.badRequest(
        "Missing required fields: target, target_id, url, secret, events"
      );
    }

    if (!["user", "org", "agent"].includes(body.target)) {
      return this.badRequest("Target must be 'user', 'org', or 'agent'");
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
      const webhookId = `wh_${generateSecureToken(16)}`;
      const now = new Date().toISOString();

      const webhook: WebhookConfig = {
        webhook_id: webhookId,
        target: body.target,
        target_id: body.target_id,
        agent_id: body.agent_id,
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

      // Add to target index
      const targetIndexKey = `webhooks:${body.target}:${body.target_id}`;
      const existingWebhooks =
        ((await this.env.ai_passport_registry.get(
          targetIndexKey,
          "json"
        )) as string[]) || [];
      await this.env.ai_passport_registry.put(
        targetIndexKey,
        JSON.stringify([...existingWebhooks, webhookId])
      );

      // If agent-specific, add to agent index
      if (body.agent_id) {
        const agentIndexKey = `webhooks:agent:${body.agent_id}`;
        const existingAgentWebhooks =
          ((await this.env.ai_passport_registry.get(
            agentIndexKey,
            "json"
          )) as string[]) || [];
        await this.env.ai_passport_registry.put(
          agentIndexKey,
          JSON.stringify([...existingAgentWebhooks, webhookId])
        );
      }

      const response = new Response(
        JSON.stringify({
          ok: true,
          message: "Webhook created successfully",
          webhook,
        }),
        {
          status: 201,
          headers: {
            "content-type": "application/json",
            ...cors(this.request),
          },
        }
      );

      return response;
    } catch (error) {
      console.error("Error creating webhook:", error);
      return this.internalError("Failed to create webhook");
    }
  }
}

class ListWebhooksHandler extends BaseApiHandler {
  async handleRequest(): Promise<Response> {
    try {
      const url = new URL(this.request.url);
      const target = url.searchParams.get("target");
      const targetId = url.searchParams.get("target_id");
      const agentId = url.searchParams.get("agent_id");

      let webhookIds: string[] = [];

      if (agentId) {
        // Get agent-specific webhooks
        const agentIndexKey = `webhooks:agent:${agentId}`;
        webhookIds =
          ((await this.env.ai_passport_registry.get(
            agentIndexKey,
            "json"
          )) as string[]) || [];
      } else if (target && targetId) {
        // Get target-specific webhooks
        const targetIndexKey = `webhooks:${target}:${targetId}`;
        webhookIds =
          ((await this.env.ai_passport_registry.get(
            targetIndexKey,
            "json"
          )) as string[]) || [];
      } else {
        // Get all webhooks (this might be expensive in production)
        // For now, return empty array
        webhookIds = [];
      }

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
      console.error("Error listing webhooks:", error);
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
  const handler = new CreateWebhookHandler(request, env, {
    allowedMethods: ["POST"],
    requireAuth: true,
    rateLimitRpm: 30,
    rateLimitType: "org",
  });
  return handler.execute();
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const handler = new ListWebhooksHandler(request, env, {
    allowedMethods: ["GET"],
    requireAuth: true,
    rateLimitRpm: 60,
    rateLimitType: "org",
  });
  return handler.execute();
};
