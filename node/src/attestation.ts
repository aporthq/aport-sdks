/**
 * Attestation Types and Interfaces
 *
 * This module defines all attestation-related types for the agent passport system.
 */

import { AssuranceLevel, AssuranceMethod } from "./types/auth";

export type AttestationType =
  | "email_verification"
  | "github_verification"
  | "github_org_verification"
  | "domain_verification"
  | "platform_verification"
  | "kyc_verification"
  | "kyb_verification"
  | "financial_verification";

// Map attestation types to assurance levels and methods
export const ATTESTATION_TO_ASSURANCE: Record<
  AttestationType,
  {
    assurance_level: AssuranceLevel;
    assurance_method: AssuranceMethod;
  }
> = {
  email_verification: {
    assurance_level: "L1",
    assurance_method: "email_verified",
  },
  github_verification: {
    assurance_level: "L1",
    assurance_method: "github_verified",
  },
  github_org_verification: {
    assurance_level: "L2",
    assurance_method: "github_verified",
  },
  domain_verification: {
    assurance_level: "L2",
    assurance_method: "domain_verified",
  },
  platform_verification: {
    assurance_level: "L2",
    assurance_method: "github_verified",
  },
  kyc_verification: { assurance_level: "L3", assurance_method: "kyc_verified" },
  kyb_verification: { assurance_level: "L3", assurance_method: "kyb_verified" },
  financial_verification: {
    assurance_level: "L4FIN",
    assurance_method: "financial_data_verified",
  },
};

export type AttestationStatus = "pending" | "verified" | "expired" | "revoked";

export type EvidenceType =
  | "email_code"
  | "dns_txt_record"
  | "github_verification"
  | "github_org_membership"
  | "platform_install_token"
  | "government_id"
  | "business_registration"
  | "financial_statement";

/**
 * Evidence used to support an attestation
 */
export interface AttestationEvidence {
  type: EvidenceType;
  value: string; // The actual evidence (e.g., email address, domain, org name)
  verified_at: string; // ISO timestamp when evidence was verified
  expires_at?: string; // ISO timestamp when evidence expires (if applicable)
  metadata?: Record<string, any>; // Additional evidence-specific data
}

/**
 * Registry countersignature for attestations
 */
export interface RegistrySignature {
  signature: string; // Ed25519 signature of the attestation
  key_id: string; // Registry key identifier
  signed_at: string; // ISO timestamp when signed
  expires_at?: string; // ISO timestamp when signature expires
}

/**
 * Core attestation record
 */
export interface Attestation {
  attestation_id: string; // Unique identifier for this attestation
  type: AttestationType;
  status: AttestationStatus;

  // What is being attested
  subject_id: string; // User ID or Org ID being attested
  subject_type: "user" | "org";

  // Evidence and verification
  evidence: AttestationEvidence;
  assurance_level: AssuranceLevel;
  assurance_method: AssuranceMethod;

  // Registry countersignature
  registry_signature: RegistrySignature;

  // Metadata
  comment?: string; // Human-readable comment about the attestation
  verified_by: string; // Registry operator or system that verified
  created_at: string;
  updated_at: string;
  expires_at?: string; // When this attestation expires

  // Audit trail
  audit_trail: AttestationAuditEntry[];
}

/**
 * Audit trail entry for attestation changes
 */
export interface AttestationAuditEntry {
  action: "created" | "verified" | "expired" | "revoked" | "updated";
  timestamp: string;
  actor: string; // Who performed the action
  reason?: string; // Why the action was taken
  metadata?: Record<string, any>; // Additional context
}

/**
 * Request to create a new attestation
 */
export interface CreateAttestationRequest {
  type: AttestationType;
  subject_id: string;
  subject_type: "user" | "org";
  evidence: Omit<AttestationEvidence, "verified_at">;
  comment?: string;
  verified_by: string;
  expires_at?: string;
}

/**
 * Request to verify evidence for an attestation
 */
export interface VerifyEvidenceRequest {
  attestation_id: string;
  evidence: AttestationEvidence;
  verified_by: string;
  comment?: string;
}

/**
 * Attestation verification result
 */
export interface AttestationVerificationResult {
  valid: boolean;
  attestation?: Attestation;
  error?: string;
  warnings?: string[];
}

/**
 * Attestation service configuration
 */
export interface AttestationConfig {
  registry_private_key: string;
  registry_key_id: string;
  signature_expires_days?: number; // Default signature expiration
  evidence_expires_days?: Record<EvidenceType, number>; // Evidence-specific expiration
}

/**
 * Evidence verification context
 */
export interface EvidenceVerificationContext {
  evidence: AttestationEvidence;
  subject_id: string;
  subject_type: "user" | "org";
  verified_by: string;
}

/**
 * Attestation propagation result
 */
export interface AttestationPropagationResult {
  updated_passports: number;
  updated_instances: number;
  updated_organizations: number;
  errors: string[];
}

/**
 * Verifiable audit entry with cryptographic integrity
 */
export interface VerifiableAuditEntry {
  entry_id: string;
  attestation_id: string;
  action: "create" | "update" | "status_change" | "delete";
  timestamp: string;
  actor: string;
  evidence: {
    type: EvidenceType;
    value_hash: string; // SHA-256 hash of evidence value for privacy
    verified_at: string;
  };
  assurance: {
    level: AssuranceLevel;
    method: AssuranceMethod;
  };
  status: AttestationStatus;
  previous_hash: string | null; // Hash of previous entry for chaining
  integrity_hash: string; // SHA-256 hash of this entry
  registry_signature: string; // Ed25519 signature of this entry
  registry_key_id: string; // Registry key used for signing
}
