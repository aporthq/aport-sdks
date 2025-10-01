/**
 * Webhook Service
 *
 * Handles triggering webhooks for various events in the Agent Passport system.
 * Manages webhook configuration retrieval, payload creation, and delivery.
 */

import { KVNamespace } from "@cloudflare/workers-types";
import {
  WebhookConfig,
  WebhookPayload,
  WebhookEventType,
} from "../../types/webhook";
import {
  sendWebhooks,
  createStatusChangedPayload,
  createPassportUpdatedPayload,
  createAssuranceUpdatedPayload,
  createAttestationPayload,
  createInstancePayload,
  WebhookConfig as LegacyWebhookConfig,
} from "./webhook";

export class WebhookService {
  private kv: KVNamespace;

  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  /**
   * Get webhooks for a specific target
   */
  async getWebhooksForTarget(
    target: "user" | "org" | "agent",
    targetId: string,
    agentId?: string
  ): Promise<WebhookConfig[]> {
    const webhookIds: string[] = [];

    if (agentId) {
      // Get agent-specific webhooks
      const agentIndexKey = `webhooks:agent:${agentId}`;
      const agentWebhooks =
        ((await this.kv.get(agentIndexKey, "json")) as string[]) || [];
      webhookIds.push(...agentWebhooks);
    }

    // Get target-specific webhooks
    const targetIndexKey = `webhooks:${target}:${targetId}`;
    const targetWebhooks =
      ((await this.kv.get(targetIndexKey, "json")) as string[]) || [];
    webhookIds.push(...targetWebhooks);

    // Remove duplicates
    const uniqueWebhookIds = [...new Set(webhookIds)];

    const webhooks: WebhookConfig[] = [];
    for (const webhookId of uniqueWebhookIds) {
      const webhookKey = `webhook:${webhookId}`;
      const webhookData = await this.kv.get(webhookKey, "json");
      if (webhookData) {
        const webhook = webhookData as WebhookConfig;
        if (webhook.active) {
          webhooks.push(webhook);
        }
      }
    }

    return webhooks;
  }

  /**
   * Trigger webhooks for status change events
   */
  async triggerStatusChanged(
    target: "user" | "org" | "agent",
    targetId: string,
    agentId: string,
    status: string,
    previousStatus: string,
    specificAgentId?: string
  ): Promise<void> {
    const webhooks = await this.getWebhooksForTarget(target, targetId, agentId);
    const relevantWebhooks = webhooks.filter((webhook) =>
      webhook.events.includes("status.changed")
    );

    if (relevantWebhooks.length === 0) return;

    const payloads = relevantWebhooks.map((webhook) =>
      createStatusChangedPayload(
        webhook.webhook_id,
        target,
        targetId,
        agentId,
        status,
        previousStatus
      )
    );

    const configs = relevantWebhooks.map((webhook) => ({
      url: webhook.url,
      secret: webhook.secret,
      retry_attempts: webhook.retry_attempts,
      timeout_ms: webhook.timeout_ms,
    }));

    await this.sendWebhooksWithPayloads(configs, payloads);
  }

  /**
   * Trigger webhooks for passport update events
   */
  async triggerPassportUpdated(
    target: "user" | "org" | "agent",
    targetId: string,
    agentId: string,
    changes: Record<string, any>,
    specificAgentId?: string
  ): Promise<void> {
    const webhooks = await this.getWebhooksForTarget(target, targetId, agentId);
    const relevantWebhooks = webhooks.filter((webhook) =>
      webhook.events.includes("passport.updated")
    );

    if (relevantWebhooks.length === 0) return;

    const payloads = relevantWebhooks.map((webhook) =>
      createPassportUpdatedPayload(
        webhook.webhook_id,
        target,
        targetId,
        agentId,
        changes
      )
    );

    const configs = relevantWebhooks.map((webhook) => ({
      url: webhook.url,
      secret: webhook.secret,
      retry_attempts: webhook.retry_attempts,
      timeout_ms: webhook.timeout_ms,
    }));

    await this.sendWebhooksWithPayloads(configs, payloads);
  }

  /**
   * Trigger webhooks for assurance update events
   */
  async triggerAssuranceUpdated(
    target: "user" | "org" | "agent",
    targetId: string,
    agentId: string,
    assuranceLevel: string,
    previousAssuranceLevel: string,
    assuranceMethod: string,
    assuranceVerifiedAt: string,
    specificAgentId?: string
  ): Promise<void> {
    const webhooks = await this.getWebhooksForTarget(target, targetId, agentId);
    const relevantWebhooks = webhooks.filter((webhook) =>
      webhook.events.includes("assurance.updated")
    );

    if (relevantWebhooks.length === 0) return;

    const payloads = relevantWebhooks.map((webhook) =>
      createAssuranceUpdatedPayload(
        webhook.webhook_id,
        target,
        targetId,
        agentId,
        assuranceLevel,
        previousAssuranceLevel,
        assuranceMethod,
        assuranceVerifiedAt
      )
    );

    const configs = relevantWebhooks.map((webhook) => ({
      url: webhook.url,
      secret: webhook.secret,
      retry_attempts: webhook.retry_attempts,
      timeout_ms: webhook.timeout_ms,
    }));

    await this.sendWebhooksWithPayloads(configs, payloads);
  }

  /**
   * Trigger webhooks for attestation events
   */
  async triggerAttestationEvent(
    target: "user" | "org" | "agent",
    targetId: string,
    agentId: string,
    eventType: "attestation.created" | "attestation.verified",
    attestationId: string,
    attestationType: string,
    attestationStatus: string,
    specificAgentId?: string
  ): Promise<void> {
    const webhooks = await this.getWebhooksForTarget(target, targetId, agentId);
    const relevantWebhooks = webhooks.filter((webhook) =>
      webhook.events.includes(eventType)
    );

    if (relevantWebhooks.length === 0) return;

    const payloads = relevantWebhooks.map((webhook) =>
      createAttestationPayload(
        webhook.webhook_id,
        target,
        targetId,
        agentId,
        eventType,
        attestationId,
        attestationType,
        attestationStatus
      )
    );

    const configs = relevantWebhooks.map((webhook) => ({
      url: webhook.url,
      secret: webhook.secret,
      retry_attempts: webhook.retry_attempts,
      timeout_ms: webhook.timeout_ms,
    }));

    await this.sendWebhooksWithPayloads(configs, payloads);
  }

  /**
   * Trigger webhooks for instance events
   */
  async triggerInstanceEvent(
    target: "user" | "org" | "agent",
    targetId: string,
    agentId: string,
    eventType: "instance.created" | "instance.suspended",
    instanceId: string,
    templateId: string,
    platformId: string,
    tenantRef: string,
    controllerId: string,
    controllerType: string,
    status?: string,
    specificAgentId?: string
  ): Promise<void> {
    const webhooks = await this.getWebhooksForTarget(target, targetId, agentId);
    const relevantWebhooks = webhooks.filter((webhook) =>
      webhook.events.includes(eventType)
    );

    if (relevantWebhooks.length === 0) return;

    const payloads = relevantWebhooks.map((webhook) =>
      createInstancePayload(
        webhook.webhook_id,
        target,
        targetId,
        agentId,
        eventType,
        instanceId,
        templateId,
        platformId,
        tenantRef,
        controllerId,
        controllerType,
        status
      )
    );

    const configs = relevantWebhooks.map((webhook) => ({
      url: webhook.url,
      secret: webhook.secret,
      retry_attempts: webhook.retry_attempts,
      timeout_ms: webhook.timeout_ms,
    }));

    await this.sendWebhooksWithPayloads(configs, payloads);
  }

  /**
   * Send webhooks with payloads and update last triggered timestamp
   */
  private async sendWebhooksWithPayloads(
    configs: LegacyWebhookConfig[],
    payloads: WebhookPayload[]
  ): Promise<void> {
    if (configs.length === 0 || payloads.length === 0) return;

    // Send webhooks
    const results = await sendWebhooks(configs, payloads[0]); // Use first payload for all configs

    // Update last triggered timestamp for successful webhooks
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const config = configs[i];
      const payload = payloads[0];

      if (result.success) {
        // Find the webhook by URL and update last triggered timestamp
        const webhookId = payload.webhook_id;
        const webhookKey = `webhook:${webhookId}`;
        const webhookData = await this.kv.get(webhookKey, "json");

        if (webhookData) {
          const webhook = webhookData as WebhookConfig;
          webhook.last_triggered_at = new Date().toISOString();
          webhook.failure_count = 0; // Reset failure count on success
          await this.kv.put(webhookKey, JSON.stringify(webhook));
        }
      } else {
        // Increment failure count
        const webhookId = payload.webhook_id;
        const webhookKey = `webhook:${webhookId}`;
        const webhookData = await this.kv.get(webhookKey, "json");

        if (webhookData) {
          const webhook = webhookData as WebhookConfig;
          webhook.failure_count = (webhook.failure_count || 0) + 1;
          await this.kv.put(webhookKey, JSON.stringify(webhook));
        }
      }
    }
  }

  /**
   * Get webhook statistics
   */
  async getWebhookStats(
    target: "user" | "org" | "agent",
    targetId: string
  ): Promise<{
    total: number;
    active: number;
    inactive: number;
    failed: number;
  }> {
    const webhooks = await this.getWebhooksForTarget(target, targetId);

    return {
      total: webhooks.length,
      active: webhooks.filter((w) => w.active).length,
      inactive: webhooks.filter((w) => !w.active).length,
      failed: webhooks.filter((w) => (w.failure_count || 0) > 0).length,
    };
  }
}

/**
 * Create webhook service instance
 */
export function createWebhookService(kv: KVNamespace): WebhookService {
  return new WebhookService(kv);
}
