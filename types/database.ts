/**
 * Base database entity types
 *
 * These types define the core structure for database entities
 * that can be extended by specific row types in the adapters.
 */

import { DatabaseDecision } from "./decision";
import { ComplianceMetadata } from "./compliance";

// ============================================================================
// Base Entity Types
// ============================================================================

export interface BaseEntity {
  created_at: string;
  updated_at: string;
}

export interface BasePolicy {
  policy_id: string;
  org_id: string;
  pack_id: string;
  name: string;
  description: string;
  is_active: boolean;
  version: number;
}

export interface BaseDecision extends DatabaseDecision {
  // All fields inherited from DatabaseDecision
}

export interface BaseCounter {
  counter_id: string;
  org_id: string;
  agent_id: string;
  currency: string;
  date_utc: string; // YYYY-MM-DD
  amount_minor: number; // Total amount in minor units
}

export interface BaseIdempotency {
  idempotency_key: string;
  org_id: string;
  agent_id: string;
  operation_type: string;
  expires_at: string;
}

// ============================================================================
// Audit Chain Support
// ============================================================================

export interface AuditEntity {
  prev_hash?: string; // For audit chain
  record_hash: string; // For audit chain
}

// ============================================================================
// JSON Storage Support
// ============================================================================

export interface JsonStorageEntity {
  // Fields that are stored as JSON strings in database
  // but represented as objects in TypeScript
  rules?: any; // For policies
  context?: any; // For decisions
  result?: any; // For idempotency
}

// ============================================================================
// Compliance Support
// ============================================================================

export interface ComplianceEntity {
  // Compliance metadata stored as JSON in database
  compliance_metadata: ComplianceMetadata;
}

export interface DataResidencyEntity {
  // Data residency information
  data_residency: {
    region: string;
    country: string;
    data_center: string;
    encryption_at_rest: boolean;
    encryption_in_transit: boolean;
    data_sovereignty: "strict" | "flexible";
    last_verified: string;
  };
}

export interface ProcessingEntity {
  // Data processing information
  processing_info: {
    lawful_basis:
      | "consent"
      | "contract"
      | "legitimate-interest"
      | "vital-interests"
      | "public-task"
      | "legal-obligation";
    purpose: string;
    retention_period_days: number;
    data_categories: string[];
    processing_activities: string[];
    data_controller: string;
    data_processor: string;
    third_party_sharing: boolean;
    automated_decision_making: boolean;
  };
}

export interface DataSubjectRightsEntity {
  // Data subject rights information
  data_subject_rights: {
    deletion: boolean;
    portability: boolean;
    rectification: boolean;
    access: boolean;
    restriction: boolean;
    objection: boolean;
    withdrawal_of_consent: boolean;
    data_portability_format: "json" | "csv" | "xml";
  };
}
