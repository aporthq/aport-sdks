/**
 * Shared types for SDK-Server communication
 * These types are used by both the SDK and the API endpoints
 */

// Canonical request/response shapes for production-grade API
export interface PolicyVerificationRequest {
  agent_id: string; // instance or template id
  idempotency_key?: string; // also sent as header; see below
  context: Record<string, any>; // policy-specific fields
}

export interface PolicyVerificationResponse {
  decision_id: string;
  allow: boolean;
  reasons?: Array<{
    code: string;
    message: string;
    severity?: "info" | "warning" | "error";
  }>;
  assurance_level?: "L0" | "L1" | "L2" | "L3" | "L4";
  expires_in?: number; // for decision token mode
  passport_digest?: string;
  signature?: string; // HMAC/JWT
  created_at?: string;
  _meta?: {
    serverTiming?: string;
  };
}

// Legacy types for backward compatibility
export interface Decision extends PolicyVerificationResponse {}

export interface DecisionReason {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
}

export interface VerificationContext {
  agent_id: string;
  policy_id: string;
  context?: Record<string, any>;
  idempotency_key?: string;
}

// JWKS support for local token validation
export interface Jwks {
  keys: Array<{
    kty: string;
    use: string;
    kid: string;
    x5t: string;
    n: string;
    e: string;
    x5c: string[];
  }>;
}
