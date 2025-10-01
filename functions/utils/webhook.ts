/**
 * Webhook utility for sending status change notifications
 * Implements retry logic with exponential backoff and dead-letter handling
 */

import { WebhookPayload, WebhookEventType } from "../../types/webhook";

// Legacy interface for backward compatibility
export interface LegacyWebhookPayload {
  agent_id: string;
  status: string;
  updated_at: string;
  previous_status?: string;
  event_type: "status_change" | "instance_created" | "instance_suspended";
  timestamp: string;
  // Instance-specific fields
  template_id?: string;
  platform_id?: string;
  tenant_ref?: string;
  controller_id?: string;
  controller_type?: string;
}

export interface WebhookConfig {
  url: string;
  secret?: string;
  retry_attempts?: number;
  retry_delay_ms?: number;
  timeout_ms?: number;
}

export interface WebhookResult {
  success: boolean;
  attempt: number;
  error?: string;
  response_status?: number;
  response_time_ms?: number;
}

/**
 * Send webhook with retry logic and exponential backoff
 */
export async function sendWebhook(
  config: WebhookConfig,
  payload: WebhookPayload | LegacyWebhookPayload
): Promise<WebhookResult> {
  const maxAttempts = config.retry_attempts || 3;
  const baseDelay = config.retry_delay_ms || 1000;
  const timeout = config.timeout_ms || 5000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const startTime = Date.now();

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      // Prepare headers
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "Agent-Passport-Webhook/1.0",
        "X-Webhook-Event": payload.event_type,
        "X-Webhook-Attempt": attempt.toString(),
      };

      // Add signature if secret is provided
      if (config.secret) {
        const signature = await generateSignature(
          JSON.stringify(payload),
          config.secret
        );
        headers["X-Webhook-Signature"] = `sha256=${signature}`;
      }

      // Send webhook
      const response = await fetch(config.url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      // Check if successful
      if (response.ok) {
        return {
          success: true,
          attempt,
          response_status: response.status,
          response_time_ms: responseTime,
        };
      }

      // Log failed attempt
      console.warn(`Webhook attempt ${attempt} failed:`, {
        url: config.url,
        status: response.status,
        statusText: response.statusText,
        responseTime,
      });

      // If this was the last attempt, return failure
      if (attempt === maxAttempts) {
        return {
          success: false,
          attempt,
          error: `HTTP ${response.status}: ${response.statusText}`,
          response_status: response.status,
          response_time_ms: responseTime,
        };
      }

      // Wait before retry with exponential backoff
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    } catch (error) {
      console.error(`Webhook attempt ${attempt} error:`, error);

      // If this was the last attempt, return failure
      if (attempt === maxAttempts) {
        return {
          success: false,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      // Wait before retry with exponential backoff
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // This should never be reached, but just in case
  return {
    success: false,
    attempt: maxAttempts,
    error: "Max attempts exceeded",
  };
}

/**
 * Generate HMAC-SHA256 signature for webhook payload
 */
async function generateSignature(
  payload: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Validate webhook signature
 */
export async function validateWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const expectedSignature = await generateSignature(payload, secret);
    const providedSignature = signature.replace(/^sha256=/, "");

    // Use constant-time comparison to prevent timing attacks
    if (expectedSignature.length !== providedSignature.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < expectedSignature.length; i++) {
      result |=
        expectedSignature.charCodeAt(i) ^ providedSignature.charCodeAt(i);
    }

    return result === 0;
  } catch (error) {
    console.error("Webhook signature validation error:", error);
    return false;
  }
}

/**
 * Create webhook payload for status change
 */
export function createStatusChangePayload(
  agent_id: string,
  status: string,
  previous_status: string,
  updated_at: string
): WebhookPayload {
  return {
    agent_id,
    status,
    updated_at,
    previous_status,
    event_type: "status.changed",
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create webhook payload for instance creation
 */
export function createInstanceCreatedPayload(
  instance_id: string,
  template_id: string,
  platform_id: string,
  tenant_ref: string,
  controller_id: string,
  controller_type: string,
  status: string,
  created_at: string
): WebhookPayload {
  return {
    agent_id: instance_id,
    status,
    updated_at: created_at,
    event_type: "instance.created",
    timestamp: new Date().toISOString(),
    template_id,
    platform_id,
    tenant_ref,
    controller_id,
    controller_type,
  };
}

/**
 * Create webhook payload for instance suspension
 */
export function createInstanceSuspendedPayload(
  instance_id: string,
  template_id: string,
  platform_id: string,
  tenant_ref: string,
  controller_id: string,
  controller_type: string,
  updated_at: string
): WebhookPayload {
  return {
    agent_id: instance_id,
    status: "suspended",
    updated_at,
    previous_status: "active",
    event_type: "instance.suspended",
    timestamp: new Date().toISOString(),
    template_id,
    platform_id,
    tenant_ref,
    controller_id,
    controller_type,
  };
}

/**
 * Log webhook failure to dead letter (simple console logging for now)
 * In production, this could write to a database or external logging service
 */
export function logDeadLetter(
  config: WebhookConfig,
  payload: WebhookPayload | LegacyWebhookPayload,
  result: WebhookResult
): void {
  const deadLetterEntry = {
    timestamp: new Date().toISOString(),
    webhook_url: config.url,
    payload,
    failure_reason: result.error,
    attempts: result.attempt,
    response_status: result.response_status,
  };

  // Log to console (in production, this would go to a proper logging service)
  console.error(
    "WEBHOOK DEAD LETTER:",
    JSON.stringify(deadLetterEntry, null, 2)
  );

  // In a real implementation, you might:
  // - Write to a database
  // - Send to a monitoring service
  // - Store in Cloudflare KV for later processing
  // - Send to a dead letter queue
}

/**
 * Create webhook payload for status change events
 */
export function createStatusChangedPayload(
  webhook_id: string,
  target: "user" | "org" | "agent",
  target_id: string,
  agent_id: string,
  status: string,
  previous_status: string
): WebhookPayload {
  return {
    webhook_id,
    event_type: "status.changed",
    target,
    target_id,
    agent_id,
    timestamp: new Date().toISOString(),
    data: {
      status,
      previous_status,
    },
  };
}

/**
 * Create webhook payload for passport update events
 */
export function createPassportUpdatedPayload(
  webhook_id: string,
  target: "user" | "org" | "agent",
  target_id: string,
  agent_id: string,
  changes: Record<string, any>
): WebhookPayload {
  return {
    webhook_id,
    event_type: "passport.updated",
    target,
    target_id,
    agent_id,
    timestamp: new Date().toISOString(),
    data: {
      passport_id: agent_id,
      changes,
    },
  };
}

/**
 * Create webhook payload for assurance update events
 */
export function createAssuranceUpdatedPayload(
  webhook_id: string,
  target: "user" | "org" | "agent",
  target_id: string,
  agent_id: string,
  assurance_level: string,
  previous_assurance_level: string,
  assurance_method: string,
  assurance_verified_at: string
): WebhookPayload {
  return {
    webhook_id,
    event_type: "assurance.updated",
    target,
    target_id,
    agent_id,
    timestamp: new Date().toISOString(),
    data: {
      assurance_level,
      previous_assurance_level,
      assurance_method,
      assurance_verified_at,
    },
  };
}

/**
 * Create webhook payload for attestation events
 */
export function createAttestationPayload(
  webhook_id: string,
  target: "user" | "org" | "agent",
  target_id: string,
  agent_id: string,
  event_type: "attestation.created" | "attestation.verified",
  attestation_id: string,
  attestation_type: string,
  attestation_status: string
): WebhookPayload {
  return {
    webhook_id,
    event_type,
    target,
    target_id,
    agent_id,
    timestamp: new Date().toISOString(),
    data: {
      attestation_id,
      attestation_type,
      attestation_status,
    },
  };
}

/**
 * Create webhook payload for instance events
 */
export function createInstancePayload(
  webhook_id: string,
  target: "user" | "org" | "agent",
  target_id: string,
  agent_id: string,
  event_type: "instance.created" | "instance.suspended",
  instance_id: string,
  template_id: string,
  platform_id: string,
  tenant_ref: string,
  controller_id: string,
  controller_type: string,
  status?: string
): WebhookPayload {
  return {
    webhook_id,
    event_type,
    target,
    target_id,
    agent_id,
    timestamp: new Date().toISOString(),
    data: {
      instance_id,
      template_id,
      platform_id,
      tenant_ref,
      controller_id,
      controller_type,
      status,
    },
  };
}

/**
 * Send webhook to multiple configurations
 */
export async function sendWebhooks(
  configs: WebhookConfig[],
  payload: WebhookPayload | LegacyWebhookPayload
): Promise<WebhookResult[]> {
  const results = await Promise.allSettled(
    configs.map((config) => sendWebhook(config, payload))
  );

  return results.map((result) =>
    result.status === "fulfilled"
      ? result.value
      : {
          success: false,
          attempt: 1,
          error: result.reason?.message || "Unknown error",
        }
  );
}

/**
 * Test webhook endpoint with ping
 */
export async function testWebhook(
  config: WebhookConfig,
  event_type: WebhookEventType = "status.changed"
): Promise<WebhookResult> {
  const testPayload: WebhookPayload = {
    webhook_id: "test",
    event_type,
    target: "user",
    target_id: "test",
    timestamp: new Date().toISOString(),
    data: {
      status: "test",
      previous_status: "test",
    },
  };

  return sendWebhook(config, testPayload);
}
