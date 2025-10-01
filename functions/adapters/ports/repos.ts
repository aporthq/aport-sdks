/**
 * Database-agnostic repository interfaces
 *
 * These ports define the contract for data access without coupling to specific
 * database implementations (D1, PostgreSQL, etc.). All handlers should use these
 * interfaces instead of direct database calls.
 */

import { PassportData } from "../../../types/passport";
import { Organization } from "../../../types/owner";
import { ComplianceMetadata } from "../../../types/compliance";
import {
  BaseEntity,
  BasePolicy,
  BaseDecision,
  BaseCounter,
  BaseIdempotency,
  AuditEntity,
  JsonStorageEntity,
} from "../../../types/database";

// ============================================================================
// Database Row Types
// ============================================================================

export interface PassportRow extends PassportData {
  // Database-specific fields (not in PassportData)
  version_number: number; // For optimistic locking

  // Legacy field for backward compatibility
  template_id?: string;

  // Compliance metadata (stored as JSON in database)
  compliance_metadata?: ComplianceMetadata;
}

export interface PassportSummary {
  agent_id: string;
  slug: string;
  name: string;
  owner_id: string;
  owner_type: "org" | "user";
  status: "draft" | "active" | "suspended" | "revoked";
  role: string;
  description: string;
  created_at: string;
  updated_at: string;
  kind?: "template" | "instance";
}

export interface OrgRow extends Organization {
  // Database-specific fields (not in Organization)
  can_issue_for_others: boolean;
  status: "active" | "suspended" | "revoked";
  org_key_id?: string;
  org_key_hash?: string;
  region: string; // "US", "EU", "CA", etc.
  db_kind: "shared" | "private"; // For private DB instances
  db_connection_string?: string; // For private DBs
}

export interface TenantRow {
  tenant_id: string; // Same as org_id
  org_id: string;
  region: string;
  db_kind: "shared" | "private";
  db_type?: "d1" | "mysql" | "postgresql"; // Database type preference
  db_connection_string?: string; // For private instances only
  created_at: string;
  updated_at: string;
}

export interface PolicyRow extends BasePolicy, BaseEntity, JsonStorageEntity {
  rules: string; // JSON string - stored in database
}

export interface DecisionEventRow
  extends BaseDecision,
    BaseEntity,
    AuditEntity,
    JsonStorageEntity {
  context: string; // JSON string - stored in database
}

export interface RefundCounterRow extends BaseCounter, BaseEntity {
  // All fields inherited from BaseCounter and BaseEntity
}

export interface IdempotencyRow
  extends BaseIdempotency,
    BaseEntity,
    JsonStorageEntity {
  result: string; // JSON string - stored in database
}

// ============================================================================
// Repository Interfaces
// ============================================================================

export interface PassportRepo {
  /**
   * Get passport by ID within an organization
   */
  getById(orgId: string, passportId: string): Promise<PassportRow | null>;

  /**
   * Get passport by slug within an organization
   */
  getBySlug(orgId: string, slug: string): Promise<PassportRow | null>;

  /**
   * Create a new passport
   */
  create(passport: PassportRow): Promise<void>;

  /**
   * Update an existing passport with optimistic concurrency
   */
  update(
    passport: PassportRow,
    opts?: { expectedVersion?: number }
  ): Promise<void>;

  /**
   * List passports by organization, optionally filtered by kind
   */
  listByOrg(
    orgId: string,
    kind?: "template" | "instance"
  ): Promise<PassportSummary[]>;

  /**
   * List passport instances by template
   */
  listInstancesByTemplate(
    orgId: string,
    templateId: string
  ): Promise<PassportSummary[]>;

  /**
   * Find instance by platform and tenant reference
   */
  findInstanceByTenant(
    orgId: string,
    platformId: string,
    tenantRef: string
  ): Promise<PassportRow | null>;

  /**
   * Check if slug is unique within organization
   */
  isSlugUnique(
    orgId: string,
    slug: string,
    excludeId?: string
  ): Promise<boolean>;

  /**
   * Check if name is unique within organization
   */
  isNameUnique(
    orgId: string,
    name: string,
    excludeId?: string
  ): Promise<boolean>;

  /**
   * Get passport count by organization
   */
  getCountByOrg(orgId: string): Promise<number>;
}

export interface DecisionLogRepo {
  /**
   * Append a decision event (append-only, for Verifiable Attestation)
   */
  append(event: DecisionEventRow): Promise<void>;

  /**
   * Get decision events for an agent
   */
  getByAgent(
    orgId: string,
    agentId: string,
    limit?: number
  ): Promise<DecisionEventRow[]>;

  /**
   * Get decision events by policy pack
   */
  getByPolicyPack(
    orgId: string,
    packId: string,
    limit?: number
  ): Promise<DecisionEventRow[]>;

  /**
   * Get latest decision for an agent
   */
  getLatestByAgent(
    orgId: string,
    agentId: string
  ): Promise<DecisionEventRow | null>;
}

export interface PolicyRepo {
  /**
   * Get active policy by pack ID
   */
  getActiveByPack(orgId: string, packId: string): Promise<PolicyRow | null>;

  /**
   * Get all policies for an organization
   */
  listByOrg(orgId: string): Promise<PolicyRow[]>;

  /**
   * Create or update a policy
   */
  upsert(policy: PolicyRow): Promise<void>;

  /**
   * Deactivate a policy
   */
  deactivate(orgId: string, policyId: string): Promise<void>;
}

export interface OrgRepo {
  /**
   * Get organization by ID
   */
  getById(orgId: string): Promise<OrgRow | null>;

  /**
   * Get tenant information for an organization
   */
  getTenant(orgId: string): Promise<TenantRow | null>;

  /**
   * Create a new organization
   */
  create(org: OrgRow): Promise<void>;

  /**
   * Update an existing organization
   */
  update(org: OrgRow): Promise<void>;

  /**
   * List organizations (admin only)
   */
  listAll(): Promise<OrgRow[]>;

  /**
   * Check if organization exists
   */
  exists(orgId: string): Promise<boolean>;
}

export interface RefundRepo {
  /**
   * Try to consume refund amount (atomic operation)
   */
  tryConsume(
    orgId: string,
    agentId: string,
    currency: string,
    amountMinor: number
  ): Promise<{ success: boolean; remaining: number }>;

  /**
   * Get current refund balance for an agent
   */
  getBalance(
    orgId: string,
    agentId: string,
    currency: string,
    dateUtc: string
  ): Promise<number>;

  /**
   * Reset refund counter (admin operation)
   */
  resetCounter(
    orgId: string,
    agentId: string,
    currency: string,
    dateUtc: string
  ): Promise<void>;
}

export interface IdempotencyRepo {
  /**
   * Check if operation is idempotent and store result
   */
  checkAndStore(
    key: string,
    orgId: string,
    agentId: string,
    operationType: string,
    result: any,
    ttlSeconds: number
  ): Promise<{ isIdempotent: boolean; cachedResult?: any }>;

  /**
   * Get cached result for idempotency key
   */
  get(key: string): Promise<IdempotencyRow | null>;

  /**
   * Clean up expired idempotency keys
   */
  cleanup(): Promise<number>;
}

// ============================================================================
// Transaction Context
// ============================================================================

export interface TxCtx {
  passports: PassportRepo;
  decisions: DecisionLogRepo;
  policies: PolicyRepo;
  orgs: OrgRepo;
  refunds: RefundRepo;
  idempotency: IdempotencyRepo;
}

// ============================================================================
// Utility Types
// ============================================================================

export interface PaginationOptions {
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface SearchOptions {
  query?: string;
  status?: string[];
  kind?: "template" | "instance";
  owner_type?: "org" | "user";
}

export interface AuditContext {
  actor: string;
  action: string;
  reason?: string;
  metadata?: Record<string, any>;
}
