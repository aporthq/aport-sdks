/**
 * Attestation Types and Interfaces
 *
 * This module defines all attestation-related types for the agent passport system.
 */
import { AssuranceLevel, AssuranceMethod } from "./auth";
export type AttestationType = "email_verification" | "github_verification" | "github_org_verification" | "domain_verification" | "platform_verification" | "kyc_verification" | "kyb_verification" | "financial_verification";
export declare const ATTESTATION_TO_ASSURANCE: Record<AttestationType, {
    assurance_level: AssuranceLevel;
    assurance_method: AssuranceMethod;
}>;
export type AttestationStatus = "pending" | "verified" | "expired" | "revoked";
export type EvidenceType = "email_code" | "dns_txt_record" | "github_verification" | "github_org_membership" | "platform_install_token" | "government_id" | "business_registration" | "financial_statement";
/**
 * Evidence used to support an attestation
 */
export interface AttestationEvidence {
    type: EvidenceType;
    value: string;
    verified_at: string;
    expires_at?: string;
    metadata?: Record<string, any>;
}
/**
 * Registry countersignature for attestations
 */
export interface RegistrySignature {
    signature: string;
    key_id: string;
    signed_at: string;
    expires_at?: string;
}
/**
 * Core attestation record
 */
export interface Attestation {
    attestation_id: string;
    type: AttestationType;
    status: AttestationStatus;
    subject_id: string;
    subject_type: "user" | "org";
    evidence: AttestationEvidence;
    assurance_level: AssuranceLevel;
    assurance_method: AssuranceMethod;
    registry_signature: RegistrySignature;
    comment?: string;
    verified_by: string;
    created_at: string;
    updated_at: string;
    expires_at?: string;
    audit_trail: AttestationAuditEntry[];
}
/**
 * Audit trail entry for attestation changes
 */
export interface AttestationAuditEntry {
    action: "created" | "verified" | "expired" | "revoked" | "updated";
    timestamp: string;
    actor: string;
    reason?: string;
    metadata?: Record<string, any>;
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
    signature_expires_days?: number;
    evidence_expires_days?: Record<EvidenceType, number>;
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
        value_hash: string;
        verified_at: string;
    };
    assurance: {
        level: AssuranceLevel;
        method: AssuranceMethod;
    };
    status: AttestationStatus;
    previous_hash: string | null;
    integrity_hash: string;
    registry_signature: string;
    registry_key_id: string;
}
//# sourceMappingURL=attestation.d.ts.map