/**
 * Core decision types shared across the application
 *
 * These types define the fundamental structure for decisions
 * that can be extended by specific implementations.
 */

// ============================================================================
// Core Decision Types
// ============================================================================

export interface BaseDecisionCore {
  decision_id: string;
  created_at: string;
}

export interface DecisionReason {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
}

// ============================================================================
// API Decision (for SDK-Server communication)
// ============================================================================

export interface Decision extends BaseDecisionCore {
  allow: boolean;
  reasons: DecisionReason[];
  expires_in: number;
  assurance_level?: string;
  passport_digest?: string;
  signature?: string;
  remaining_daily_cap?: Record<string, number>; // Currency -> remaining amount
  owner_id?: string; // Owner ID from the passport
  policy_id?: string; // Policy pack identifier
  kid?: string; // Key identifier for signature verification
  decision_token?: string; // Optional compact JWT for sub-TTL caching
}

// ============================================================================
// Database Decision (for Verifiable Attestation storage)
// ============================================================================

export interface DatabaseDecision extends BaseDecisionCore {
  org_id: string;
  agent_id: string;
  policy_pack_id: string;
  decision: "allow" | "deny";
  reason: string;
  expires_at?: string;
}

// ============================================================================
// Verification Context
// ============================================================================

export interface VerificationContext {
  agent_id: string;
  policy_id: string;
  context?: Record<string, any>;
  idempotency_key?: string;
}

export interface PolicyVerificationRequest {
  context: VerificationContext;
  passport_data?: any; // Optional passport data for offline verification
}

export interface PolicyVerificationResponse {
  decision: Decision;
  passport?: any; // Optional passport data
}
