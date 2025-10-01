/**
 * Webhook types and interfaces for the Agent Passport system
 */

export type WebhookEventType =
  | "status.changed"
  | "passport.updated"
  | "assurance.updated"
  | "attestation.created"
  | "attestation.verified"
  | "instance.created"
  | "instance.suspended";

export type WebhookTarget = "user" | "org" | "agent";

export interface WebhookConfig {
  webhook_id: string;
  target: WebhookTarget;
  target_id: string;
  agent_id?: string; // Optional, for agent-level overrides
  url: string;
  secret: string;
  events: WebhookEventType[];
  active: boolean;
  created_at: string;
  updated_at: string;
  last_triggered_at?: string;
  failure_count: number;
  retry_attempts: number;
  timeout_ms: number;
}

export interface CreateWebhookRequest {
  target: WebhookTarget;
  target_id: string;
  agent_id?: string; // Optional, for agent-level overrides
  url: string;
  secret: string;
  events: WebhookEventType[];
  active?: boolean;
  retry_attempts?: number;
  timeout_ms?: number;
}

export interface UpdateWebhookRequest {
  url?: string;
  secret?: string;
  events?: WebhookEventType[];
  active?: boolean;
  retry_attempts?: number;
  timeout_ms?: number;
}

export interface WebhookPayload {
  webhook_id: string;
  event_type: WebhookEventType;
  target: WebhookTarget;
  target_id: string;
  agent_id?: string;
  timestamp: string;
  data: {
    // Status change events
    status?: string;
    previous_status?: string;

    // Passport update events
    passport_id?: string;
    changes?: Record<string, any>;

    // Assurance update events
    assurance_level?: string;
    previous_assurance_level?: string;
    assurance_method?: string;
    assurance_verified_at?: string;

    // Attestation events
    attestation_id?: string;
    attestation_type?: string;
    attestation_status?: string;

    // Instance events
    instance_id?: string;
    template_id?: string;
    platform_id?: string;
    tenant_ref?: string;
    controller_id?: string;
    controller_type?: string;
  };
}

export interface WebhookTestRequest {
  webhook_id: string;
  event_type?: WebhookEventType;
}

export interface WebhookTestResponse {
  success: boolean;
  response_status?: number;
  response_time_ms?: number;
  error?: string;
  attempt: number;
}

export interface WebhookListResponse {
  webhooks: WebhookConfig[];
  total: number;
}

export interface WebhookSecretRotateResponse {
  new_secret: string;
  webhook_id: string;
}
