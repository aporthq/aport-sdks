/**
 * Drizzle schema for Agent Passport database
 *
 * This schema is SQLite-compatible and designed to work with Cloudflare D1.
 * All tables are designed to support multi-tenant isolation and optimistic concurrency.
 */

import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ============================================================================
// Passports Table
// ============================================================================

export const passports = sqliteTable(
  "passports",
  {
    // Core Identity
    agent_id: text("agent_id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    owner_id: text("owner_id").notNull(), // ap_org_xxx or ap_user_xxx (tenant identifier)
    owner_type: text("owner_type", { enum: ["org", "user"] }).notNull(),
    owner_display: text("owner_display").notNull(),
    controller_type: text("controller_type", {
      enum: ["org", "person", "api", "user"],
    }).notNull(),
    claimed: integer("claimed", { mode: "boolean" }).notNull().default(false),

    // Agent Details
    role: text("role").notNull(),
    description: text("description").notNull(),
    capabilities: text("capabilities").notNull().default("[]"), // JSON string
    limits: text("limits").notNull().default("{}"), // JSON string
    regions: text("regions").notNull().default("[]"), // JSON string array

    // Status & Verification
    status: text("status", {
      enum: ["draft", "active", "suspended", "revoked"],
    }).notNull(),
    verification_status: text("verification_status", {
      enum: ["unverified", "email_verified", "github_verified"],
    })
      .notNull()
      .default("unverified"),
    verification_method: text("verification_method"),
    verification_evidence: text("verification_evidence"), // JSON string

    // Assurance
    assurance_level: text("assurance_level").notNull(),
    assurance_method: text("assurance_method"),
    assurance_verified_at: text("assurance_verified_at"),

    // Contact & Links
    contact: text("contact").notNull(),
    links: text("links").notNull().default("{}"), // JSON string

    // Categorization & Metadata
    categories: text("categories"), // JSON string array
    framework: text("framework"), // JSON string array
    logo_url: text("logo_url"),

    // System Metadata
    source: text("source", { enum: ["admin", "form", "crawler"] }).notNull(),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
    version: text("version").notNull(),
    model_info: text("model_info"), // JSON string

    // Issuance & Delegation
    issuer_type: text("issuer_type", { enum: ["user", "org"] }),
    issued_by: text("issued_by"),
    provisioned_by_org_id: text("provisioned_by_org_id"),
    pending_owner: text("pending_owner"), // JSON string
    sponsor_orgs: text("sponsor_orgs"), // JSON string array

    // Registry Signature
    registry_key_id: text("registry_key_id"),
    registry_sig: text("registry_sig"),
    canonical_hash: text("canonical_hash"),
    verified_at: text("verified_at"),

    // Template/Instance Support
    kind: text("kind", { enum: ["template", "instance"] }),
    parent_agent_id: text("parent_agent_id"),
    platform_id: text("platform_id"),
    controller_id: text("controller_id"),
    tenant_ref: text("tenant_ref"),

    // MCP Support
    mcp: text("mcp"), // JSON string

    // Evaluation & Attestations
    evaluation: text("evaluation"), // JSON string
    attestations: text("attestations"), // JSON string

    // Optimistic concurrency
    version_number: integer("version_number").notNull().default(1),

    // Compliance metadata (stored as JSON)
    compliance_metadata: text("compliance_metadata"), // JSON string
  },
  (table) => ({
    // Indexes for performance
    ownerIdIdx: index("passports_owner_id_idx").on(table.owner_id),
    slugIdx: index("passports_slug_idx").on(table.slug),
    statusIdx: index("passports_status_idx").on(table.status),
    kindIdx: index("passports_kind_idx").on(table.kind),
    parentAgentIdx: index("passports_parent_agent_idx").on(
      table.parent_agent_id
    ),
    platformTenantIdx: index("passports_platform_tenant_idx").on(
      table.platform_id,
      table.tenant_ref
    ),

    // Unique constraints
    ownerSlugUnique: uniqueIndex("passports_owner_slug_unique").on(
      table.owner_id,
      table.slug
    ),
  })
);

// ============================================================================
// Organizations Table
// ============================================================================

export const organizations = sqliteTable(
  "organizations",
  {
    org_id: text("org_id").primaryKey(),
    name: text("name").notNull(),
    domain: text("domain"),
    contact_email: text("contact_email").notNull(),
    assurance_level: text("assurance_level").notNull(),
    assurance_method: text("assurance_method"),
    assurance_verified_at: text("assurance_verified_at"),
    can_issue_for_others: integer("can_issue_for_others", { mode: "boolean" })
      .notNull()
      .default(false),
    status: text("status", { enum: ["active", "suspended", "revoked"] })
      .notNull()
      .default("active"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
    org_key_id: text("org_key_id"),
    org_key_hash: text("org_key_hash"),
    region: text("region").notNull().default("US"),
    db_kind: text("db_kind", { enum: ["shared", "private"] })
      .notNull()
      .default("shared"),
    db_connection_string: text("db_connection_string"),
  },
  (table) => ({
    regionIdx: index("organizations_region_idx").on(table.region),
    statusIdx: index("organizations_status_idx").on(table.status),
    domainIdx: index("organizations_domain_idx").on(table.domain),
  })
);

// ============================================================================
// Tenants Table
// ============================================================================

export const tenants = sqliteTable(
  "tenants",
  {
    tenant_id: text("tenant_id").primaryKey(), // Same as org_id
    org_id: text("org_id").notNull(),
    region: text("region").notNull().default("US"),
    db_kind: text("db_kind", { enum: ["shared", "private"] })
      .notNull()
      .default("shared"),
    db_connection_string: text("db_connection_string"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (table) => ({
    orgIdIdx: index("tenants_org_id_idx").on(table.org_id),
    regionIdx: index("tenants_region_idx").on(table.region),
  })
);

// ============================================================================
// Policies Table
// ============================================================================

export const policies = sqliteTable(
  "policies",
  {
    policy_id: text("policy_id").primaryKey(),
    org_id: text("org_id").notNull(),
    pack_id: text("pack_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    rules: text("rules").notNull(), // JSON string
    is_active: integer("is_active", { mode: "boolean" })
      .notNull()
      .default(true),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
    version: integer("version").notNull().default(1),
  },
  (table) => ({
    orgIdIdx: index("policies_org_id_idx").on(table.org_id),
    packIdIdx: index("policies_pack_id_idx").on(table.pack_id),
    activeIdx: index("policies_active_idx").on(table.is_active),
    orgPackActiveIdx: index("policies_org_pack_active_idx").on(
      table.org_id,
      table.pack_id,
      table.is_active
    ),
  })
);

// ============================================================================
// Decision Events Table (Verifiable Attestation)
// ============================================================================

export const decision_events = sqliteTable(
  "decision_events",
  {
    decision_id: text("decision_id").primaryKey(),
    org_id: text("org_id").notNull(),
    agent_id: text("agent_id").notNull(),
    policy_pack_id: text("policy_pack_id").notNull(),
    decision: text("decision", { enum: ["allow", "deny"] }).notNull(),
    reason: text("reason").notNull(),
    context: text("context").notNull(), // JSON string
    created_at: text("created_at").notNull(),
    prev_hash: text("prev_hash"), // For audit chain
    record_hash: text("record_hash").notNull(), // For audit chain
    expires_at: text("expires_at"),
  },
  (table) => ({
    orgIdIdx: index("decision_events_org_id_idx").on(table.org_id),
    agentIdIdx: index("decision_events_agent_id_idx").on(table.agent_id),
    packIdIdx: index("decision_events_pack_id_idx").on(table.policy_pack_id),
    createdAtIdx: index("decision_events_created_at_idx").on(table.created_at),
    orgAgentIdx: index("decision_events_org_agent_idx").on(
      table.org_id,
      table.agent_id
    ),
  })
);

// ============================================================================
// Refund Counters Table
// ============================================================================

export const refund_counters = sqliteTable(
  "refund_counters",
  {
    counter_id: text("counter_id").primaryKey(),
    org_id: text("org_id").notNull(),
    agent_id: text("agent_id").notNull(),
    currency: text("currency").notNull(),
    date_utc: text("date_utc").notNull(), // YYYY-MM-DD
    amount_minor: integer("amount_minor").notNull().default(0),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (table) => ({
    orgAgentIdx: index("refund_counters_org_agent_idx").on(
      table.org_id,
      table.agent_id
    ),
    currencyDateIdx: index("refund_counters_currency_date_idx").on(
      table.currency,
      table.date_utc
    ),
    orgAgentCurrencyDateIdx: uniqueIndex(
      "refund_counters_org_agent_currency_date_unique"
    ).on(table.org_id, table.agent_id, table.currency, table.date_utc),
  })
);

// ============================================================================
// Idempotency Table
// ============================================================================

export const idempotency_keys = sqliteTable(
  "idempotency_keys",
  {
    idempotency_key: text("idempotency_key").primaryKey(),
    org_id: text("org_id").notNull(),
    agent_id: text("agent_id").notNull(),
    operation_type: text("operation_type").notNull(),
    result: text("result").notNull(), // JSON string
    created_at: text("created_at").notNull(),
    expires_at: text("expires_at").notNull(),
  },
  (table) => ({
    orgAgentIdx: index("idempotency_org_agent_idx").on(
      table.org_id,
      table.agent_id
    ),
    expiresAtIdx: index("idempotency_expires_at_idx").on(table.expires_at),
  })
);

// ============================================================================
// Migration History Table
// ============================================================================

export const migrations = sqliteTable("migrations", {
  version: integer("version").primaryKey(),
  name: text("name").notNull(),
  applied_at: text("applied_at").notNull(),
  checksum: text("checksum").notNull(),
});

// ============================================================================
// Type Exports
// ============================================================================

export type Passport = typeof passports.$inferSelect;
export type NewPassport = typeof passports.$inferInsert;

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;

export type Policy = typeof policies.$inferSelect;
export type NewPolicy = typeof policies.$inferInsert;

export type DecisionEvent = typeof decision_events.$inferSelect;
export type NewDecisionEvent = typeof decision_events.$inferInsert;

export type RefundCounter = typeof refund_counters.$inferSelect;
export type NewRefundCounter = typeof refund_counters.$inferInsert;

export type IdempotencyKey = typeof idempotency_keys.$inferSelect;
export type NewIdempotencyKey = typeof idempotency_keys.$inferInsert;

export type Migration = typeof migrations.$inferSelect;
export type NewMigration = typeof migrations.$inferInsert;
