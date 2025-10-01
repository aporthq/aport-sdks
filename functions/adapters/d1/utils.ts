/**
 * Shared utilities for D1 adapter
 *
 * This module provides common utilities to avoid code duplication
 * and ensure consistent behavior across all D1 repositories.
 */

// ============================================================================
// JSON Serialization Utilities
// ============================================================================

/**
 * Safely parse JSON string with fallback
 */
export function safeJsonParse<T = any>(
  jsonString: string | null | undefined,
  fallback: T
): T {
  if (!jsonString) return fallback;

  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.warn(`Failed to parse JSON: ${jsonString}`, error);
    return fallback;
  }
}

/**
 * Safely stringify object to JSON
 */
export function safeJsonStringify(obj: any): string | null {
  if (obj === null || obj === undefined) return null;

  try {
    return JSON.stringify(obj);
  } catch (error) {
    console.warn(`Failed to stringify object:`, obj, error);
    return null;
  }
}

// ============================================================================
// Database Row Mapping Utilities
// ============================================================================

/**
 * Map database row to PassportRow with proper JSON parsing
 */
export function mapToPassportRow(dbPassport: any): any {
  return {
    ...dbPassport,
    capabilities: safeJsonParse(dbPassport.capabilities, []),
    limits: safeJsonParse(dbPassport.limits, {}),
    regions: safeJsonParse(dbPassport.regions, []),
    verification_evidence: safeJsonParse(
      dbPassport.verification_evidence,
      undefined
    ),
    links: safeJsonParse(dbPassport.links, {}),
    categories: safeJsonParse(dbPassport.categories, undefined),
    framework: safeJsonParse(dbPassport.framework, undefined),
    model_info: safeJsonParse(dbPassport.model_info, undefined),
    pending_owner: safeJsonParse(dbPassport.pending_owner, undefined),
    sponsor_orgs: safeJsonParse(dbPassport.sponsor_orgs, undefined),
    mcp: safeJsonParse(dbPassport.mcp, undefined),
    evaluation: safeJsonParse(dbPassport.evaluation, undefined),
    attestations: safeJsonParse(dbPassport.attestations, undefined),
    compliance_metadata: safeJsonParse(
      dbPassport.compliance_metadata,
      undefined
    ),
  };
}

/**
 * Map PassportRow to database row with proper JSON stringification
 */
export function mapToDbPassport(passport: any): any {
  return {
    ...passport,
    capabilities: safeJsonStringify(passport.capabilities),
    limits: safeJsonStringify(passport.limits),
    regions: safeJsonStringify(passport.regions),
    verification_evidence: safeJsonStringify(passport.verification_evidence),
    links: safeJsonStringify(passport.links),
    categories: safeJsonStringify(passport.categories),
    framework: safeJsonStringify(passport.framework),
    model_info: safeJsonStringify(passport.model_info),
    pending_owner: safeJsonStringify(passport.pending_owner),
    sponsor_orgs: safeJsonStringify(passport.sponsor_orgs),
    mcp: safeJsonStringify(passport.mcp),
    evaluation: safeJsonStringify(passport.evaluation),
    attestations: safeJsonStringify(passport.attestations),
    compliance_metadata: safeJsonStringify(passport.compliance_metadata),
  };
}

/**
 * Map database row to OrgRow with null/undefined conversion
 */
export function mapToOrgRow(dbOrg: any): any {
  return {
    ...dbOrg,
    domain: dbOrg.domain || undefined,
    assurance_level: dbOrg.assurance_level as any, // Cast to AssuranceLevel
    assurance_method: (dbOrg.assurance_method as any) || undefined, // Cast to AssuranceMethod
    assurance_verified_at: dbOrg.assurance_verified_at || undefined,
    org_key_id: dbOrg.org_key_id || undefined,
    org_key_hash: dbOrg.org_key_hash || undefined,
    db_connection_string: dbOrg.db_connection_string || undefined,
    members: [], // TODO: Load members from separate table if needed
  };
}

/**
 * Map database row to TenantRow with null/undefined conversion
 */
export function mapToTenantRow(dbTenant: any): any {
  return {
    ...dbTenant,
    db_connection_string: dbTenant.db_connection_string || undefined,
  };
}

/**
 * Map database row to PolicyRow with JSON parsing
 */
export function mapToPolicyRow(dbPolicy: any): any {
  return {
    ...dbPolicy,
    rules: safeJsonParse(dbPolicy.rules, {}),
  };
}

/**
 * Map database row to DecisionEventRow with JSON parsing
 */
export function mapToDecisionEventRow(dbEvent: any): any {
  return {
    ...dbEvent,
    context: safeJsonParse(dbEvent.context, {}),
  };
}

/**
 * Map database row to IdempotencyRow with JSON parsing
 */
export function mapToIdempotencyRow(dbRow: any): any {
  return {
    ...dbRow,
    result: safeJsonParse(dbRow.result, {}),
  };
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate required fields for passport creation
 */
export function validatePassportFields(passport: any): string[] {
  const errors: string[] = [];

  if (!passport.agent_id) errors.push("agent_id is required");
  if (!passport.slug) errors.push("slug is required");
  if (!passport.name) errors.push("name is required");
  if (!passport.owner_id) errors.push("owner_id is required");
  if (!passport.owner_type) errors.push("owner_type is required");
  if (!passport.role) errors.push("role is required");
  if (!passport.description) errors.push("description is required");
  if (!passport.contact) errors.push("contact is required");
  if (!passport.status) errors.push("status is required");
  if (!passport.assurance_level) errors.push("assurance_level is required");
  if (!passport.source) errors.push("source is required");
  if (!passport.created_at) errors.push("created_at is required");
  if (!passport.updated_at) errors.push("updated_at is required");
  if (!passport.version) errors.push("version is required");

  return errors;
}

/**
 * Validate required fields for organization creation
 */
export function validateOrgFields(org: any): string[] {
  const errors: string[] = [];

  if (!org.org_id) errors.push("org_id is required");
  if (!org.name) errors.push("name is required");
  if (!org.contact_email) errors.push("contact_email is required");
  if (!org.assurance_level) errors.push("assurance_level is required");
  if (!org.created_at) errors.push("created_at is required");
  if (!org.updated_at) errors.push("updated_at is required");
  if (!org.region) errors.push("region is required");
  if (!org.db_kind) errors.push("db_kind is required");

  return errors;
}

// ============================================================================
// Error Handling Utilities
// ============================================================================

/**
 * Wrap database operations with proper error handling
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.error(`Database operation failed in ${context}:`, error);
    throw new Error(
      `Database operation failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// ============================================================================
// Performance Utilities
// ============================================================================

/**
 * Create a counter ID for refund operations
 */
export function createCounterId(
  orgId: string,
  agentId: string,
  currency: string,
  dateUtc?: string
): string {
  const date = dateUtc || new Date().toISOString().split("T")[0];
  return `${orgId}:${agentId}:${currency}:${date}`;
}

/**
 * Generate unique decision ID
 */
export function generateDecisionId(): string {
  return `dec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate unique counter ID
 */
export function generateCounterId(): string {
  return `cnt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
