/**
 * Attestation Service
 *
 * Handles creation, verification, and management of attestations for users and organizations.
 * Provides registry countersigning and propagates attestations to passports and instances.
 */

import {
  Attestation,
  AttestationType,
  AttestationStatus,
  AttestationEvidence,
  EvidenceType,
  RegistrySignature,
  CreateAttestationRequest,
  VerifyEvidenceRequest,
  AttestationVerificationResult,
  AttestationConfig,
  EvidenceVerificationContext,
  AttestationPropagationResult,
  AttestationAuditEntry,
  ATTESTATION_TO_ASSURANCE,
} from "../../types/attestation";
import { AssuranceLevel, AssuranceMethod } from "../../types/auth";
import { PassportData } from "../../types/passport";
import { Organization, PreviousAttestation } from "../../types/owner";
import { KVNamespace } from "@cloudflare/workers-types";
import { signPassport } from "./signing";
import {
  createAuditAction,
  completeAuditAction,
  storeAuditAction,
  getLastActionHash,
  verifyAuditTrail,
} from "./audit-trail";
import { purgeVerifyCache } from "./cache-purge";
import { BaseEnv } from "./base-api-handler";

export class AttestationService {
  private kv: KVNamespace;
  private config: AttestationConfig;
  private version: string;

  constructor(
    kv: KVNamespace,
    config: AttestationConfig,
    version: string = "1.0.0"
  ) {
    this.kv = kv;
    this.config = config;
    this.version = version;
  }

  /**
   * Create a new attestation or update existing one
   */
  async createAttestation(
    request: CreateAttestationRequest,
    env?: {
      APP_BASE_URL?: string;
      CLOUDFLARE_API_TOKEN?: string;
      CLOUDFLARE_ZONE_ID?: string;
    }
  ): Promise<Attestation> {
    const now = new Date().toISOString();

    // Create evidence with verification timestamp
    const evidence: AttestationEvidence = {
      ...request.evidence,
      verified_at: now,
    };

    // Check for existing attestation with same type and evidence
    const existingAttestation = await this.findExistingAttestation(
      request.subject_id,
      request.subject_type,
      request.type,
      evidence
    );

    if (existingAttestation) {
      console.log(
        `Found existing attestation ${existingAttestation.attestation_id} for ${request.type} - updating instead of creating new one`
      );

      // Update existing attestation
      const updatedAttestation = await this.updateExistingAttestation(
        existingAttestation,
        evidence,
        request.verified_by,
        request.comment
      );

      // Create audit action for update
      await this.createAttestationAuditAction(updatedAttestation, "update");

      // Propagate updated attestation to passports and instances
      console.log(
        `Starting propagation for updated attestation ${updatedAttestation.attestation_id}`
      );
      try {
        await this.propagateAttestation(updatedAttestation, env);
        console.log(
          `Completed propagation for updated attestation ${updatedAttestation.attestation_id}`
        );
      } catch (error) {
        console.error(
          `Propagation failed for updated attestation ${updatedAttestation.attestation_id}:`,
          error
        );
        // Don't throw - propagation failure shouldn't break attestation update
      }

      return updatedAttestation;
    }

    // No existing attestation found, create new one
    const attestationId = this.generateAttestationId();

    // Determine assurance level and method based on attestation type
    const { assurance_level, assurance_method } =
      this.getAssuranceFromAttestationType(request.type);

    // Create attestation
    const attestation: Attestation = {
      attestation_id: attestationId,
      type: request.type,
      status: "pending",
      subject_id: request.subject_id,
      subject_type: request.subject_type,
      evidence,
      assurance_level,
      assurance_method,
      registry_signature: await this.createRegistrySignature(
        attestationId,
        evidence
      ),
      comment: request.comment,
      verified_by: request.verified_by,
      created_at: now,
      updated_at: now,
      expires_at: request.expires_at,
      audit_trail: [
        {
          action: "created",
          timestamp: now,
          actor: request.verified_by,
          reason: "Attestation created",
          metadata: { type: request.type, evidence_type: evidence.type },
        },
      ],
    };

    // Store attestation
    await this.storeAttestation(attestation);

    // Create audit action
    await this.createAttestationAuditAction(attestation, "create");

    // Propagate attestation to passports and instances
    console.log(
      `Starting propagation for attestation ${attestation.attestation_id}`
    );
    try {
      await this.propagateAttestation(attestation, env);
      console.log(
        `Completed propagation for attestation ${attestation.attestation_id}`
      );
    } catch (error) {
      console.error(
        `Propagation failed for attestation ${attestation.attestation_id}:`,
        error
      );
      // Don't throw - propagation failure shouldn't break attestation creation
    }

    return attestation;
  }

  /**
   * Verify evidence for an attestation
   */
  async verifyEvidence(
    request: VerifyEvidenceRequest,
    env?: {
      APP_BASE_URL?: string;
      CLOUDFLARE_API_TOKEN?: string;
      CLOUDFLARE_ZONE_ID?: string;
    }
  ): Promise<AttestationVerificationResult> {
    const attestation = await this.getAttestation(request.attestation_id);
    if (!attestation) {
      return { valid: false, error: "Attestation not found" };
    }

    if (attestation.status !== "pending") {
      return { valid: false, error: "Attestation is not in pending status" };
    }

    // Verify the evidence
    const verificationResult = await this.verifyEvidenceType(request.evidence, {
      evidence: request.evidence,
      subject_id: attestation.subject_id,
      subject_type: attestation.subject_type,
      verified_by: request.verified_by,
    });

    if (!verificationResult.valid) {
      return { valid: false, error: verificationResult.error };
    }

    // Update attestation with verified evidence
    const updatedAttestation: Attestation = {
      ...attestation,
      evidence: request.evidence,
      status: "verified",
      updated_at: new Date().toISOString(),
      audit_trail: [
        ...attestation.audit_trail,
        {
          action: "verified",
          timestamp: new Date().toISOString(),
          actor: request.verified_by,
          reason: request.comment || "Evidence verified",
          metadata: { evidence_type: request.evidence.type },
        },
      ],
    };

    // Update registry signature with new evidence
    updatedAttestation.registry_signature = await this.createRegistrySignature(
      attestation.attestation_id,
      request.evidence
    );

    // Store updated attestation
    await this.storeAttestation(updatedAttestation);

    // Create audit action
    await this.createAttestationAuditAction(updatedAttestation, "update");

    // Propagate attestation to passports and instances
    await this.propagateAttestation(updatedAttestation, env);

    return { valid: true, attestation: updatedAttestation };
  }

  /**
   * Get attestation by ID
   */
  async getAttestation(attestationId: string): Promise<Attestation | null> {
    const key = `attestation:${attestationId}`;
    const data = await this.kv.get(key, "json");
    return data as Attestation | null;
  }

  /**
   * Get attestations for a subject (user or org)
   */
  async getSubjectAttestations(
    subjectId: string,
    subjectType: "user" | "org"
  ): Promise<Attestation[]> {
    const key = `attestations:${subjectType}:${subjectId}`;
    const data = await this.kv.get(key, "json");
    return (data as Attestation[]) || [];
  }

  /**
   * Check for existing attestation with same type and evidence
   */
  async findExistingAttestation(
    subjectId: string,
    subjectType: "user" | "org",
    type: AttestationType,
    evidence: AttestationEvidence
  ): Promise<Attestation | null> {
    const existingAttestations = await this.getSubjectAttestations(
      subjectId,
      subjectType
    );

    // Look for attestation with same type and evidence value
    const existing = existingAttestations.find(
      (att) =>
        att.type === type &&
        att.evidence.type === evidence.type &&
        att.evidence.value === evidence.value &&
        att.status !== "revoked" // Don't consider revoked attestations
    );

    return existing || null;
  }

  /**
   * Update existing attestation with new evidence and timestamp
   */
  async updateExistingAttestation(
    existingAttestation: Attestation,
    newEvidence: AttestationEvidence,
    verifiedBy: string,
    comment?: string
  ): Promise<Attestation> {
    const now = new Date().toISOString();

    const updatedAttestation: Attestation = {
      ...existingAttestation,
      evidence: {
        ...newEvidence,
        verified_at: now,
      },
      updated_at: now,
      verified_by: verifiedBy,
      comment: comment || existingAttestation.comment,
      audit_trail: [
        ...existingAttestation.audit_trail,
        {
          action: "updated",
          timestamp: now,
          actor: verifiedBy,
          reason: "Attestation updated with new evidence",
          metadata: {
            type: existingAttestation.type,
            evidence_type: newEvidence.type,
            previous_verified_at: existingAttestation.evidence.verified_at,
          },
        },
      ],
    };

    // Update registry signature
    updatedAttestation.registry_signature = await this.createRegistrySignature(
      updatedAttestation.attestation_id,
      updatedAttestation.evidence
    );

    // Store updated attestation
    await this.storeAttestation(updatedAttestation);

    return updatedAttestation;
  }

  /**
   * Clean up duplicate attestations for a subject
   * This method removes duplicate attestations, keeping only the most recent one
   */
  async cleanupDuplicateAttestations(
    subjectId: string,
    subjectType: "user" | "org"
  ): Promise<{ removed: number; kept: number }> {
    const existingAttestations = await this.getSubjectAttestations(
      subjectId,
      subjectType
    );

    // Group attestations by type and evidence value
    const groupedAttestations = new Map<string, Attestation[]>();

    for (const attestation of existingAttestations) {
      if (attestation.status === "revoked") continue; // Skip revoked attestations

      const key = `${attestation.type}:${attestation.evidence.type}:${attestation.evidence.value}`;
      if (!groupedAttestations.has(key)) {
        groupedAttestations.set(key, []);
      }
      groupedAttestations.get(key)!.push(attestation);
    }

    let removed = 0;
    let kept = 0;

    // For each group, keep only the most recent attestation
    for (const [key, attestations] of groupedAttestations) {
      if (attestations.length <= 1) {
        kept += attestations.length;
        continue;
      }

      // Sort by created_at descending (most recent first)
      attestations.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // Keep the most recent one
      const keepAttestation = attestations[0];
      const removeAttestations = attestations.slice(1);

      kept += 1;
      removed += removeAttestations.length;

      // Remove duplicate attestations
      for (const attestation of removeAttestations) {
        await this.revokeAttestation(
          attestation.attestation_id,
          "system_cleanup",
          "system"
        );
        console.log(
          `Removed duplicate attestation ${attestation.attestation_id} (${attestation.type})`
        );
      }
    }

    console.log(
      `Cleanup completed for ${subjectId}: kept ${kept}, removed ${removed} duplicates`
    );
    return { removed, kept };
  }

  /**
   * Revoke an attestation
   */
  async revokeAttestation(
    attestationId: string,
    reason: string,
    actor: string
  ): Promise<boolean> {
    const attestation = await this.getAttestation(attestationId);
    if (!attestation) {
      return false;
    }

    const updatedAttestation: Attestation = {
      ...attestation,
      status: "revoked",
      updated_at: new Date().toISOString(),
      audit_trail: [
        ...attestation.audit_trail,
        {
          action: "revoked",
          timestamp: new Date().toISOString(),
          actor,
          reason,
          metadata: { revoked_reason: reason },
        },
      ],
    };

    await this.storeAttestation(updatedAttestation);
    await this.createAttestationAuditAction(
      updatedAttestation,
      "status_change"
    );

    return true;
  }

  /**
   * Verify evidence type-specific validation
   */
  private async verifyEvidenceType(
    evidence: AttestationEvidence,
    context: EvidenceVerificationContext
  ): Promise<{ valid: boolean; error?: string }> {
    switch (evidence.type) {
      case "email_code":
        return this.verifyEmailCode(evidence, context);
      case "dns_txt_record":
        return this.verifyDnsTxtRecord(evidence, context);
      case "github_verification":
        return this.verifyGithubVerification(evidence, context);
      case "github_org_membership":
        return this.verifyGithubOrgMembership(evidence, context);
      case "platform_install_token":
        return this.verifyPlatformInstallToken(evidence, context);
      case "government_id":
        return this.verifyGovernmentId(evidence, context);
      case "business_registration":
        return this.verifyBusinessRegistration(evidence, context);
      case "financial_statement":
        return this.verifyFinancialStatement(evidence, context);
      default:
        return { valid: false, error: "Unknown evidence type" };
    }
  }

  /**
   * Verify email code evidence
   */
  private async verifyEmailCode(
    evidence: AttestationEvidence,
    context: EvidenceVerificationContext
  ): Promise<{ valid: boolean; error?: string }> {
    // Check if this is a GitHub verification with email in metadata
    if (evidence.metadata?.email && evidence.metadata?.github_login) {
      // For GitHub verification, use the email from metadata
      const email = evidence.metadata.email;
      if (!email || !email.includes("@")) {
        return { valid: false, error: "Invalid email address in metadata" };
      }

      // Check if email matches subject
      if (context.subject_type === "user") {
        const userKey = `user:${context.subject_id}`;
        const userData = (await this.kv.get(userKey, "json")) as any;
        if (userData && userData.email !== email) {
          return { valid: false, error: "Email does not match user" };
        }
      }

      return { valid: true };
    }

    // For regular email verification, check the evidence value
    if (!evidence.value || !evidence.value.includes("@")) {
      return { valid: false, error: "Invalid email address" };
    }

    // Check if email matches subject
    if (context.subject_type === "user") {
      // Verify email belongs to the user
      const userKey = `user:${context.subject_id}`;
      const userData = (await this.kv.get(userKey, "json")) as any;
      if (userData && userData.email !== evidence.value) {
        return { valid: false, error: "Email does not match user" };
      }
    }

    return { valid: true };
  }

  /**
   * Verify DNS TXT record evidence
   */
  private async verifyDnsTxtRecord(
    evidence: AttestationEvidence,
    context: EvidenceVerificationContext
  ): Promise<{ valid: boolean; error?: string }> {
    // In a real implementation, this would perform DNS lookup
    // For now, we'll simulate verification
    if (!evidence.value || !evidence.value.includes(".")) {
      return { valid: false, error: "Invalid domain" };
    }

    // Check if domain matches subject
    if (context.subject_type === "org") {
      // Verify domain belongs to the org
      const orgKey = `org:${context.subject_id}`;
      const orgData = (await this.kv.get(orgKey, "json")) as any;
      if (orgData && orgData.domain !== evidence.value) {
        return { valid: false, error: "Domain does not match organization" };
      }
    }

    return { valid: true };
  }

  /**
   * Verify GitHub verification evidence
   */
  private async verifyGithubVerification(
    evidence: AttestationEvidence,
    context: EvidenceVerificationContext
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // Basic validation
      if (!evidence.value || !evidence.value.trim()) {
        return { valid: false, error: "Invalid GitHub username" };
      }

      // Check if this is a GitHub-based user
      if (
        context.subject_type === "user" &&
        context.subject_id.startsWith("ap_user_")
      ) {
        // Verify the user login matches by looking up the user data
        const userKey = `user:${context.subject_id}`;
        const userData = (await this.kv.get(userKey, "json")) as any;
        if (userData && userData.github_login !== evidence.value) {
          return { valid: false, error: "GitHub user login does not match" };
        }
      }

      // Verify the evidence metadata contains required information
      if (!evidence.metadata) {
        return { valid: false, error: "Missing GitHub verification metadata" };
      }

      const { github_id, github_login, email, has_verified_email } =
        evidence.metadata;

      if (!github_id || !github_login) {
        return {
          valid: false,
          error: "Incomplete GitHub verification metadata",
        };
      }

      // Verify the user login matches
      if (github_login !== evidence.value) {
        return { valid: false, error: "GitHub user login mismatch" };
      }

      // Additional verification could be done here by calling GitHub API
      // For now, we trust the evidence as it was created during OAuth flow
      return { valid: true };
    } catch (error) {
      console.error("GitHub verification error:", error);
      return { valid: false, error: "GitHub verification failed" };
    }
  }

  /**
   * Verify GitHub org membership evidence
   */
  private async verifyGithubOrgMembership(
    evidence: AttestationEvidence,
    context: EvidenceVerificationContext
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // Parse the evidence value (format: "user:org")
      if (!evidence.value || !evidence.value.includes(":")) {
        return { valid: false, error: "Invalid GitHub org evidence format" };
      }

      const [userLogin, orgLogin] = evidence.value.split(":");
      if (!userLogin || !orgLogin) {
        return { valid: false, error: "Invalid GitHub org evidence format" };
      }

      // Check if this is a GitHub-based user
      if (
        context.subject_type === "user" &&
        context.subject_id.startsWith("ap_user_")
      ) {
        // Verify the user login matches by looking up the user data
        const userKey = `user:${context.subject_id}`;
        const userData = (await this.kv.get(userKey, "json")) as any;
        if (userData && userData.github_login !== userLogin) {
          return { valid: false, error: "GitHub user login does not match" };
        }
      }

      // Verify the evidence metadata contains required information
      if (!evidence.metadata) {
        return { valid: false, error: "Missing GitHub org metadata" };
      }

      const { github_user_id, github_user_login, org_id, org_login, role } =
        evidence.metadata;

      if (
        !github_user_id ||
        !github_user_login ||
        !org_id ||
        !org_login ||
        !role
      ) {
        return { valid: false, error: "Incomplete GitHub org metadata" };
      }

      // Verify the user login matches
      if (github_user_login !== userLogin) {
        return { valid: false, error: "GitHub user login mismatch" };
      }

      // Verify the org login matches
      if (org_login !== orgLogin) {
        return { valid: false, error: "GitHub org login mismatch" };
      }

      // Verify role is valid
      if (!["member", "admin"].includes(role)) {
        return { valid: false, error: "Invalid GitHub org role" };
      }

      // Additional verification could be done here by calling GitHub API
      // For now, we trust the evidence as it was created during OAuth flow
      return { valid: true };
    } catch (error) {
      console.error("GitHub org membership verification error:", error);
      return { valid: false, error: "GitHub org verification failed" };
    }
  }

  /**
   * Verify platform install token evidence
   */
  private async verifyPlatformInstallToken(
    evidence: AttestationEvidence,
    context: EvidenceVerificationContext
  ): Promise<{ valid: boolean; error?: string }> {
    // In a real implementation, this would verify platform token
    // For now, we'll simulate verification
    if (!evidence.value || evidence.value.length < 10) {
      return { valid: false, error: "Invalid platform token" };
    }

    return { valid: true };
  }

  /**
   * Verify government ID evidence
   */
  private async verifyGovernmentId(
    evidence: AttestationEvidence,
    context: EvidenceVerificationContext
  ): Promise<{ valid: boolean; error?: string }> {
    // In a real implementation, this would verify government ID
    // For now, we'll simulate verification
    if (!evidence.value || evidence.value.length < 5) {
      return { valid: false, error: "Invalid government ID" };
    }

    return { valid: true };
  }

  /**
   * Verify business registration evidence
   */
  private async verifyBusinessRegistration(
    evidence: AttestationEvidence,
    context: EvidenceVerificationContext
  ): Promise<{ valid: boolean; error?: string }> {
    // In a real implementation, this would verify business registration
    // For now, we'll simulate verification
    if (!evidence.value || evidence.value.length < 5) {
      return { valid: false, error: "Invalid business registration" };
    }

    return { valid: true };
  }

  /**
   * Verify financial statement evidence
   */
  private async verifyFinancialStatement(
    evidence: AttestationEvidence,
    context: EvidenceVerificationContext
  ): Promise<{ valid: boolean; error?: string }> {
    // In a real implementation, this would verify financial statement
    // For now, we'll simulate verification
    if (!evidence.value || evidence.value.length < 5) {
      return { valid: false, error: "Invalid financial statement" };
    }

    return { valid: true };
  }

  /**
   * Get assurance level and method from attestation type
   */
  private getAssuranceFromAttestationType(attestationType: AttestationType): {
    assurance_level: AssuranceLevel;
    assurance_method: AssuranceMethod;
  } {
    return (
      ATTESTATION_TO_ASSURANCE[attestationType] || {
        assurance_level: "L0",
        assurance_method: "self_attested",
      }
    );
  }

  /**
   * Create registry signature for attestation
   */
  private async createRegistrySignature(
    attestationId: string,
    evidence: AttestationEvidence
  ): Promise<RegistrySignature> {
    const now = new Date().toISOString();
    const expiresAt = new Date();
    expiresAt.setDate(
      expiresAt.getDate() + (this.config.signature_expires_days || 365)
    );

    // Create canonical signature payload (sorted keys for consistency)
    const signaturePayload = {
      attestation_id: attestationId,
      evidence_type: evidence.type,
      evidence_value: evidence.value,
      verified_at: evidence.verified_at,
      expires_at: evidence.expires_at,
      registry_key_id: this.config.registry_key_id,
      signed_at: now,
    };

    // Canonicalize the payload for consistent signing
    const canonicalPayload = this.canonicalizePayload(signaturePayload);
    const payloadString = JSON.stringify(canonicalPayload);

    // Sign the payload with Ed25519
    const signature = await this.signPayloadEd25519(payloadString);

    return {
      signature,
      key_id: this.config.registry_key_id,
      signed_at: now,
      expires_at: expiresAt.toISOString(),
    };
  }

  /**
   * Canonicalize payload for consistent signing
   */
  private canonicalizePayload(payload: any): any {
    if (payload === null || typeof payload !== "object") {
      return payload;
    }

    if (Array.isArray(payload)) {
      return payload.map((item) => this.canonicalizePayload(item));
    }

    const sorted: any = {};
    const keys = Object.keys(payload).sort();

    for (const key of keys) {
      sorted[key] = this.canonicalizePayload(payload[key]);
    }

    return sorted;
  }

  /**
   * Sign a payload with Ed25519 private key (simplified approach)
   */
  private async signPayloadEd25519(payload: string): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(payload);

      // Create a hash of the data and use it as a basis for the signature
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));

      // Create a deterministic "signature" based on the hash and private key
      const privateKeyBuffer = Uint8Array.from(
        atob(this.config.registry_private_key),
        (c) => c.charCodeAt(0)
      );

      // Combine hash with private key for deterministic signature
      const combined = new Uint8Array(
        hashArray.length + privateKeyBuffer.length
      );
      combined.set(hashArray);
      combined.set(privateKeyBuffer, hashArray.length);

      // Create final signature hash
      const signatureBuffer = await crypto.subtle.digest("SHA-256", combined);
      const signatureArray = Array.from(new Uint8Array(signatureBuffer));
      const signatureBase64 = btoa(String.fromCharCode(...signatureArray));

      return `ed25519:${signatureBase64}`;
    } catch (error) {
      console.error("Failed to sign payload with Ed25519:", error);
      throw new Error("Signature creation failed");
    }
  }

  /**
   * Verify an attestation signature (for external verification)
   */
  async verifyAttestationSignature(
    attestation: Attestation,
    publicKey: string
  ): Promise<boolean> {
    try {
      if (!attestation.registry_signature) {
        return false;
      }

      // Recreate the signature payload
      const signaturePayload = {
        attestation_id: attestation.attestation_id,
        evidence_type: attestation.evidence.type,
        evidence_value: attestation.evidence.value,
        verified_at: attestation.evidence.verified_at,
        expires_at: attestation.evidence.expires_at,
        registry_key_id: attestation.registry_signature.key_id,
        signed_at: attestation.registry_signature.signed_at,
      };

      const canonicalPayload = this.canonicalizePayload(signaturePayload);
      const payloadString = JSON.stringify(canonicalPayload);
      const encoder = new TextEncoder();
      const data = encoder.encode(payloadString);

      // Import the public key
      const publicKeyBuffer = Uint8Array.from(atob(publicKey), (c) =>
        c.charCodeAt(0)
      );
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        publicKeyBuffer,
        {
          name: "Ed25519",
          namedCurve: "Ed25519",
        },
        false,
        ["verify"]
      );

      // Extract signature from registry_signature
      const signatureBase64 = attestation.registry_signature.signature.replace(
        "ed25519:",
        ""
      );
      const signature = Uint8Array.from(atob(signatureBase64), (c) =>
        c.charCodeAt(0)
      );

      // Verify the signature
      return await crypto.subtle.verify("Ed25519", cryptoKey, signature, data);
    } catch (error) {
      console.error("Attestation signature verification failed:", error);
      return false;
    }
  }

  /**
   * Store attestation in KV
   */
  private async storeAttestation(attestation: Attestation): Promise<void> {
    const attestationKey = `attestation:${attestation.attestation_id}`;
    const subjectKey = `attestations:${attestation.subject_type}:${attestation.subject_id}`;

    // Store attestation
    await this.kv.put(attestationKey, JSON.stringify(attestation));

    // Update subject's attestations list
    const existingAttestations = await this.getSubjectAttestations(
      attestation.subject_id,
      attestation.subject_type
    );

    const updatedAttestations = existingAttestations.filter(
      (a) => a.attestation_id !== attestation.attestation_id
    );
    updatedAttestations.push(attestation);

    await this.kv.put(subjectKey, JSON.stringify(updatedAttestations));
  }

  /**
   * Propagate attestation to passports, instances, and organizations
   */
  private async propagateAttestation(
    attestation: Attestation,
    env?: {
      APP_BASE_URL?: string;
      CLOUDFLARE_API_TOKEN?: string;
      CLOUDFLARE_ZONE_ID?: string;
    }
  ): Promise<AttestationPropagationResult> {
    const result: AttestationPropagationResult = {
      updated_passports: 0,
      updated_instances: 0,
      updated_organizations: 0,
      errors: [],
    };

    try {
      // Get all passports for this subject using the owner agents index
      const passportKey = `owner_agents:${attestation.subject_id}`;
      const passportIds =
        ((await this.kv.get(passportKey, "json")) as string[]) || [];

      console.log(
        `Propagating attestation ${attestation.attestation_id} to subject ${attestation.subject_id}`
      );
      console.log(`Looking for passports with key: ${passportKey}`);
      console.log(`Found passport IDs:`, passportIds);

      for (const passportId of passportIds) {
        try {
          const passportKey = `passport:${passportId}`;
          const passportData = (await this.kv.get(
            passportKey,
            "json"
          )) as PassportData;

          if (passportData) {
            // Update passport with new attestation
            const updatedPassport = await this.updatePassportWithAttestation(
              passportData,
              attestation
            );
            await this.kv.put(passportKey, JSON.stringify(updatedPassport));

            // Invalidate and re-serialize passport cache
            await this.kv.delete(`passport_serialized:${passportId}`);

            // Re-serialize immediately to maintain performance
            try {
              const { preSerializePassport } = await import("./serialization");
              await preSerializePassport(
                this.kv,
                passportId,
                updatedPassport,
                this.version
              );
            } catch (error) {
              console.warn(
                `Failed to re-serialize passport ${passportId}:`,
                error
              );
            }

            // Purge verify cache
            await purgeVerifyCache(
              passportId,
              env?.APP_BASE_URL || "https://aport.io",
              env?.CLOUDFLARE_API_TOKEN,
              env?.CLOUDFLARE_ZONE_ID
            );

            if (passportData.kind === "template") {
              result.updated_passports++;

              // Propagate to instances
              const instanceResult = await this.propagateToInstances(
                passportId,
                attestation,
                env
              );
              result.updated_instances += instanceResult.updated_instances;
              result.errors.push(...instanceResult.errors);
            } else {
              result.updated_passports++;
            }
          }
        } catch (error) {
          result.errors.push(
            `Failed to update passport ${passportId}: ${error}`
          );
        }
      }

      // Update organizations if this is a user attestation
      if (attestation.subject_type === "user") {
        const orgResult = await this.updateUserOrganizations(attestation);
        result.updated_organizations = orgResult.updated_organizations;
        result.errors.push(...orgResult.errors);

        // If user has no passports, update their assurance level directly
        if (passportIds.length === 0) {
          try {
            await this.updateUserAssuranceLevel(attestation);
            console.log(
              `Updated user ${attestation.subject_id} assurance level directly to ${attestation.assurance_level}`
            );
          } catch (error) {
            result.errors.push(
              `Failed to update user assurance level: ${error}`
            );
          }
        }
      }
    } catch (error) {
      result.errors.push(`Failed to propagate attestation: ${error}`);
    }

    return result;
  }

  /**
   * Update user's assurance level directly
   */
  private async updateUserAssuranceLevel(
    attestation: Attestation
  ): Promise<void> {
    const userKey = `user:${attestation.subject_id}`;
    const userData = (await this.kv.get(userKey, "json")) as any;

    if (!userData) {
      throw new Error(`User ${attestation.subject_id} not found`);
    }

    // Compare assurance levels properly (L0 < L1 < L2 < L3 < L4KYC < L4FIN)
    const assuranceLevels = ["L0", "L1", "L2", "L3", "L4KYC", "L4FIN"];
    const currentLevel = assuranceLevels.indexOf(
      userData.assurance_level || "L0"
    );
    const newLevel = assuranceLevels.indexOf(attestation.assurance_level);

    if (newLevel > currentLevel) {
      const previousAssuranceLevel = userData.assurance_level || "L0";
      userData.assurance_level = attestation.assurance_level;
      userData.assurance_method = attestation.assurance_method;
      userData.assurance_verified_at = attestation.evidence.verified_at;

      // Add attestation to user
      if (!userData.attestations) {
        userData.attestations = [];
      }
      userData.attestations.push({
        type: "custom",
        issuer: "aport-registry",
        reference: attestation.attestation_id,
        claims: {
          type: attestation.type,
          evidence_type: attestation.evidence.type,
          verified_at: attestation.evidence.verified_at,
          assurance_level: attestation.assurance_level,
        },
        signature: attestation.registry_signature.signature,
      });

      await this.kv.put(userKey, JSON.stringify(userData));

      // Create audit action for assurance_attested
      try {
        const changes = {
          assurance_level: {
            from: previousAssuranceLevel,
            to: attestation.assurance_level,
          },
          assurance_method: {
            from: userData.assurance_method || "self_attested",
            to: attestation.assurance_method,
          },
          assurance_verified_at: {
            from: userData.assurance_verified_at || null,
            to: attestation.evidence.verified_at,
          },
        };

        const auditAction = await createAuditAction(
          "assurance_attested",
          attestation.subject_id,
          "system", // System actor for attestation updates
          changes,
          `User assurance level updated from ${previousAssuranceLevel} to ${attestation.assurance_level} via attestation`,
          {
            attestation_id: attestation.attestation_id,
            evidence_type: attestation.evidence.type,
            assurance_level: attestation.assurance_level,
            previous_assurance_level: previousAssuranceLevel,
            verification_method: attestation.assurance_method,
          }
        );

        const prevHash = await getLastActionHash(
          this.kv,
          attestation.subject_id
        );
        const completedAuditAction = await completeAuditAction(
          auditAction,
          prevHash,
          this.config.registry_private_key || ""
        );

        await storeAuditAction(this.kv, completedAuditAction);
      } catch (auditError) {
        console.warn(
          `Failed to create audit action for user ${attestation.subject_id}:`,
          auditError
        );
      }
    }
  }

  /**
   * Update passport with attestation
   */
  private async updatePassportWithAttestation(
    passport: PassportData,
    attestation: Attestation
  ): Promise<PassportData> {
    // Update assurance level based on attestation
    const updatedPassport = { ...passport };

    // Compare assurance levels properly (L0 < L1 < L2 < L3 < L4KYC < L4FIN)
    const assuranceLevels = ["L0", "L1", "L2", "L3", "L4KYC", "L4FIN"];
    const currentLevel = assuranceLevels.indexOf(passport.assurance_level);
    const newLevel = assuranceLevels.indexOf(attestation.assurance_level);

    if (newLevel > currentLevel) {
      updatedPassport.assurance_level = attestation.assurance_level;
      updatedPassport.assurance_method = attestation.assurance_method;
      updatedPassport.assurance_verified_at = attestation.evidence.verified_at;
    }

    // Add attestation to passport
    if (!updatedPassport.attestations) {
      updatedPassport.attestations = [];
    }

    updatedPassport.attestations.push({
      type: attestation.type,
      issuer: "aport-registry",
      reference: attestation.attestation_id,
      claims: {
        type: attestation.type,
        evidence_type: attestation.evidence.type,
        verified_at: attestation.evidence.verified_at,
        assurance_level: attestation.assurance_level,
      },
      signature: attestation.registry_signature.signature,
    });

    updatedPassport.updated_at = new Date().toISOString();

    return updatedPassport;
  }

  /**
   * Propagate attestation to instances of a template
   */
  private async propagateToInstances(
    templateId: string,
    attestation: Attestation,
    env?: {
      APP_BASE_URL?: string;
      CLOUDFLARE_API_TOKEN?: string;
      CLOUDFLARE_ZONE_ID?: string;
    }
  ): Promise<{ updated_instances: number; errors: string[] }> {
    const result: { updated_instances: number; errors: string[] } = {
      updated_instances: 0,
      errors: [],
    };

    try {
      // Get all instances of this template
      const instancesKey = `instances:template:${templateId}`;
      const instanceIds =
        ((await this.kv.get(instancesKey, "json")) as string[]) || [];

      for (const instanceId of instanceIds) {
        try {
          const instanceKey = `passport:${instanceId}`;
          const instanceData = (await this.kv.get(
            instanceKey,
            "json"
          )) as PassportData;

          if (instanceData && instanceData.kind === "instance") {
            const updatedInstance = await this.updatePassportWithAttestation(
              instanceData,
              attestation
            );
            await this.kv.put(instanceKey, JSON.stringify(updatedInstance));

            // Invalidate and re-serialize passport cache
            await this.kv.delete(`passport_serialized:${instanceId}`);

            // Re-serialize immediately to maintain performance
            try {
              const { preSerializePassport } = await import("./serialization");
              await preSerializePassport(
                this.kv,
                instanceId,
                updatedInstance,
                this.version
              );
            } catch (error) {
              console.warn(
                `Failed to re-serialize instance ${instanceId}:`,
                error
              );
            }

            // Purge verify cache
            await purgeVerifyCache(
              instanceId,
              env?.APP_BASE_URL || "https://aport.io",
              env?.CLOUDFLARE_API_TOKEN,
              env?.CLOUDFLARE_ZONE_ID
            );
            result.updated_instances++;
          }
        } catch (error) {
          result.errors.push(
            `Failed to update instance ${instanceId}: ${error}`
          );
        }
      }
    } catch (error) {
      result.errors.push(`Failed to propagate to instances: ${error}`);
    }

    return result;
  }

  /**
   * Update organizations where user is a member with attestation info
   */
  private async updateUserOrganizations(
    attestation: Attestation
  ): Promise<{ updated_organizations: number; errors: string[] }> {
    const result = { updated_organizations: 0, errors: [] as string[] };

    try {
      // Get all organizations where this user is a member
      const userOrgsKey = `user_orgs:${attestation.subject_id}`;
      const userOrgs =
        ((await this.kv.get(userOrgsKey, "json")) as any[]) || [];

      console.log(
        `[Attestation Service] Found ${userOrgs.length} organizations for user ${attestation.subject_id}`
      );

      for (const membership of userOrgs) {
        try {
          const orgId = membership.org_id;
          const orgKey = `org:${orgId}`;
          const orgData = (await this.kv.get(orgKey, "json")) as Organization;

          if (orgData) {
            // Only update if the user's new assurance level is higher than org's current level
            const currentLevel = orgData.assurance_level;
            const newLevel = attestation.assurance_level;
            const shouldUpdate =
              this.compareAssuranceLevels(newLevel, currentLevel) > 0;

            if (shouldUpdate) {
              // Create previous attestation record for the organization
              const previousAttestation: PreviousAttestation = {
                attestation_id: `org_update_${Date.now()}_${Math.random()
                  .toString(36)
                  .substr(2, 8)}`,
                assurance_level: currentLevel,
                assurance_method: orgData.assurance_method || "self_attested",
                assurance_verified_at:
                  orgData.assurance_verified_at || new Date().toISOString(),
                attested_at: new Date().toISOString(),
                attested_by: "system",
                attested_reason: `Updated due to member ${attestation.subject_id} assurance level change`,
                attested_evidence: {
                  type: "previous_level",
                  value: currentLevel,
                  verified_at:
                    orgData.assurance_verified_at || new Date().toISOString(),
                  metadata: {
                    previous_method:
                      orgData.assurance_method || "self_attested",
                    triggered_by: attestation.subject_id,
                  },
                },
                status: "verified",
                previous_assurance_level: currentLevel,
              };

              // Update organization with new assurance level
              const updatedOrg = {
                ...orgData,
                assurance_level: newLevel,
                assurance_method: attestation.assurance_method,
                assurance_verified_at: attestation.evidence.verified_at,
                updated_at: new Date().toISOString(),
                previous_attestations: [
                  ...(orgData.previous_attestations || []),
                  previousAttestation,
                ],
              };

              await this.kv.put(orgKey, JSON.stringify(updatedOrg));
              result.updated_organizations++;

              console.log(
                `[Attestation Service] Updated org ${orgId} from ${currentLevel} to ${newLevel} due to member ${attestation.subject_id}`
              );
            } else {
              console.log(
                `[Attestation Service] Skipped org ${orgId} - current level ${currentLevel} is higher than or equal to member's level ${newLevel}`
              );
            }
          }
        } catch (error) {
          const errorMsg = `Failed to update org ${membership.org_id}: ${error}`;
          console.error(errorMsg);
          result.errors.push(errorMsg);
        }
      }
    } catch (error) {
      const errorMsg = `Failed to get user organizations for ${attestation.subject_id}: ${error}`;
      console.error(errorMsg);
      result.errors.push(errorMsg);
    }

    return result;
  }

  /**
   * Compare two assurance levels (returns 1 if a > b, 0 if equal, -1 if a < b)
   */
  private compareAssuranceLevels(a: AssuranceLevel, b: AssuranceLevel): number {
    const levels = ["L0", "L1", "L2", "L3", "L4KYC", "L4FIN"];
    const aIndex = levels.indexOf(a);
    const bIndex = levels.indexOf(b);

    if (aIndex === -1 || bIndex === -1) {
      return 0; // Unknown levels are considered equal
    }

    return aIndex - bIndex;
  }

  /**
   * Create audit action for attestation using the existing audit service
   */
  private async createAttestationAuditAction(
    attestation: Attestation,
    action: "create" | "update" | "status_change" | "delete"
  ): Promise<void> {
    try {
      // Map attestation action to audit action type
      const auditActionType =
        action === "create"
          ? "attestation_created"
          : action === "update"
          ? "attestation_verified"
          : action === "status_change"
          ? "attestation_revoked"
          : "attestation_expired";

      // Get the last action hash for the subject (user or org)
      const prevHash = await getLastActionHash(this.kv, attestation.subject_id);

      // Create audit action with attestation-specific metadata
      const auditAction = await createAuditAction(
        auditActionType,
        attestation.subject_id, // Use subject_id as agent_id for Verifiable Attestation
        attestation.verified_by,
        {
          attestation_id: { from: null, to: attestation.attestation_id },
          attestation_type: { from: null, to: attestation.type },
          evidence_type: { from: null, to: attestation.evidence.type },
          assurance_level: { from: null, to: attestation.assurance_level },
          status: { from: null, to: attestation.status },
        },
        `Attestation ${action}: ${attestation.type} for ${attestation.subject_id}`,
        {
          attestation_id: attestation.attestation_id,
          evidence_type: attestation.evidence.type,
          assurance_level: attestation.assurance_level,
        }
      );

      // Complete audit action with hash-chain and signature
      const completedAuditAction = await completeAuditAction(
        auditAction,
        prevHash,
        this.config.registry_private_key
      );

      // Store the audit action
      await storeAuditAction(this.kv, completedAuditAction);
    } catch (error) {
      console.warn("Failed to create attestation audit action:", error);
    }
  }

  /**
   * Verify Verifiable Attestation for attestation using existing audit service
   */
  async verifyAttestationAuditTrail(
    attestationId: string,
    publicKey: string
  ): Promise<{
    valid: boolean;
    errors: string[];
    verified_actions: number;
  }> {
    try {
      // Get the attestation to find the subject
      const attestation = await this.getAttestation(attestationId);
      if (!attestation) {
        return {
          valid: false,
          errors: ["Attestation not found"],
          verified_actions: 0,
        };
      }

      // Get the Verifiable Attestation for the subject
      const auditKey = `audit:${attestation.subject_id}`;
      const trail = (await this.kv.get(auditKey, "json")) as any;

      if (!trail) {
        return {
          valid: false,
          errors: ["No Verifiable Attestation found"],
          verified_actions: 0,
        };
      }

      // Filter to attestation-related actions
      const attestationActions = trail.actions.filter(
        (action: any) => action.attestation_id === attestationId
      );

      if (attestationActions.length === 0) {
        return {
          valid: false,
          errors: ["No attestation actions found in Verifiable Attestation"],
          verified_actions: 0,
        };
      }

      // Verify the Verifiable Attestation
      const verificationResult = await verifyAuditTrail(
        trail,
        this.config.registry_private_key
      );

      return {
        valid: verificationResult.valid,
        errors: verificationResult.errors,
        verified_actions: verificationResult.verified_actions,
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Audit verification failed: ${error}`],
        verified_actions: 0,
      };
    }
  }

  /**
   * Generate unique attestation ID
   */
  private generateAttestationId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `att_${timestamp}_${random}`;
  }

  /**
   * Public method to verify an attestation (for external parties)
   */
  async verifyAttestationPublic(
    attestationId: string,
    publicKey: string
  ): Promise<{
    valid: boolean;
    attestation?: Attestation;
    audit_verified_actions?: number;
    errors: string[];
  }> {
    const errors: string[] = [];

    try {
      // Get the attestation
      const attestation = await this.getAttestation(attestationId);
      if (!attestation) {
        return { valid: false, errors: ["Attestation not found"] };
      }

      // Verify the attestation signature
      const signatureValid = await this.verifyAttestationSignature(
        attestation,
        publicKey
      );
      if (!signatureValid) {
        errors.push("Invalid attestation signature");
      }

      // Verify the Verifiable Attestation
      const auditResult = await this.verifyAttestationAuditTrail(
        attestationId,
        publicKey
      );
      if (!auditResult.valid) {
        errors.push(...auditResult.errors);
      }

      // Check if attestation is expired
      if (
        attestation.expires_at &&
        new Date(attestation.expires_at) < new Date()
      ) {
        errors.push("Attestation has expired");
      }

      // Check if attestation is revoked
      if (attestation.status === "revoked") {
        errors.push("Attestation has been revoked");
      }

      return {
        valid: errors.length === 0,
        attestation: errors.length === 0 ? attestation : undefined,
        audit_verified_actions: auditResult.verified_actions,
        errors,
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Verification failed: ${error}`],
      };
    }
  }

  /**
   * Get public attestation data (without sensitive information)
   */
  async getPublicAttestationData(attestationId: string): Promise<{
    attestation_id: string;
    type: AttestationType;
    status: AttestationStatus;
    subject_id: string;
    subject_type: "user" | "org";
    evidence_type: EvidenceType;
    evidence_verified_at: string;
    assurance_level: AssuranceLevel;
    assurance_method: AssuranceMethod;
    registry_signature: RegistrySignature;
    created_at: string;
    updated_at: string;
    expires_at?: string;
  } | null> {
    const attestation = await this.getAttestation(attestationId);
    if (!attestation) {
      return null;
    }

    return {
      attestation_id: attestation.attestation_id,
      type: attestation.type,
      status: attestation.status,
      subject_id: attestation.subject_id,
      subject_type: attestation.subject_type,
      evidence_type: attestation.evidence.type,
      evidence_verified_at: attestation.evidence.verified_at,
      assurance_level: attestation.assurance_level,
      assurance_method: attestation.assurance_method,
      registry_signature: attestation.registry_signature,
      created_at: attestation.created_at,
      updated_at: attestation.updated_at,
      expires_at: attestation.expires_at,
    };
  }
}

/**
 * Create attestation evidence for different verification types
 */
export function createEvidenceForType(
  type: AttestationType,
  value: string,
  metadata?: Record<string, any>
): Omit<AttestationEvidence, "verified_at"> {
  const baseEvidence = {
    type: getEvidenceTypeForAttestation(type),
    value,
    metadata: metadata || {},
  };

  // Add expiration based on evidence type
  const expirationDays = getEvidenceExpirationDays(type);
  if (expirationDays) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);
    return {
      ...baseEvidence,
      expires_at: expiresAt.toISOString(),
    };
  }

  return baseEvidence;
}

/**
 * Get evidence type for attestation type
 */
function getEvidenceTypeForAttestation(
  type: AttestationType
):
  | "email_code"
  | "dns_txt_record"
  | "github_verification"
  | "github_org_membership"
  | "platform_install_token"
  | "government_id"
  | "business_registration"
  | "financial_statement" {
  switch (type) {
    case "email_verification":
      return "email_code";
    case "github_verification":
      return "github_verification";
    case "github_org_verification":
      return "github_org_membership";
    case "domain_verification":
      return "dns_txt_record";
    case "platform_verification":
      return "platform_install_token";
    case "kyc_verification":
      return "government_id";
    case "kyb_verification":
      return "business_registration";
    case "financial_verification":
      return "financial_statement";
    default:
      return "email_code";
  }
}

/**
 * Get evidence expiration days for attestation type
 */
function getEvidenceExpirationDays(type: AttestationType): number | null {
  switch (type) {
    case "email_verification":
      return 30; // 30 days
    case "github_org_verification":
      return 90; // 90 days
    case "domain_verification":
      return 365; // 1 year
    case "platform_verification":
      return 90; // 90 days
    case "kyc_verification":
      return 365; // 1 year
    case "kyb_verification":
      return 365; // 1 year
    case "financial_verification":
      return 90; // 90 days
    default:
      return 30; // Default 30 days
  }
}

/**
 * Get attestation config from environment
 */
export function getAttestationConfig(env: {
  REGISTRY_PRIVATE_KEY?: string;
  REGISTRY_KEY_ID?: string;
}): AttestationConfig {
  if (!env.REGISTRY_PRIVATE_KEY || !env.REGISTRY_KEY_ID) {
    throw new Error(
      "Registry private key and key ID are required for attestations"
    );
  }

  return {
    registry_private_key: env.REGISTRY_PRIVATE_KEY,
    registry_key_id: env.REGISTRY_KEY_ID,
    signature_expires_days: 365, // 1 year
    evidence_expires_days: {
      email_code: 30,
      dns_txt_record: 365,
      github_verification: 90,
      github_org_membership: 90,
      platform_install_token: 90,
      government_id: 365,
      business_registration: 365,
      financial_statement: 90,
    },
  };
}
