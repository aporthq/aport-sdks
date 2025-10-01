export type Capability = {
  id: string;
  params?: Record<string, string | number | boolean>;
};

// Import the typed limits from the limits utility
import { TypedLimits } from "../functions/utils/limits";
// Import controlled taxonomy enums
import {
  PassportCategory,
  PassportFramework,
} from "../functions/utils/taxonomy";

// Re-export for external use
export type { PassportCategory, PassportFramework };
// Import assurance types
import { AssuranceLevel, AssuranceMethod } from "../functions/utils/assurance";
import { AttestationType } from "./attestation";

export type { AssuranceLevel, AssuranceMethod };
export type PassportLimits = TypedLimits;

export interface ModelInfo {
  // Add to PassportData (all optional)
  model_refs?: Array<{
    provider: string; // "OpenAI" | "Anthropic" | "Meta" | "local"
    id: string; // "gpt-4o-mini" | "claude-3.5" | "Llama3-8B"
    version?: string; // "2025-08-01"
    hash?: string; // sha256 of model artifact if local
    modality?: string; // "text" | "vision" | "multimodal"
    evals?: Array<{ name: string; score: number | string; date?: string }>; // optional benchmarks
    safety?: {
      // optional, coarse buckets
      jailbreak?: "low" | "med" | "high";
      toxicity?: "low" | "med" | "high";
    };
  }>;

  tools?: Array<{
    name: string; // "payments" | "browser" | "crm"
    provider?: string; // "Stripe" | "Zendesk" | "Custom"
    version?: string;
    scopes?: string[]; // "refunds:write","tickets:read"
  }>;

  provenance?: {
    repo?: string; // url to source
    commit?: string; // git sha if applicable
    manifest_hash?: string; // if you adopt a repo manifest
  };

  data_access?: {
    pii?: boolean; // touches PII?
    pci?: boolean; // touches card data?
    sources?: string[]; // "zendesk","stripe","s3://..."
  };
}

export interface PassportData {
  // Core Identity
  agent_id: string;
  slug: string;
  name: string;
  owner_id: string; // ap_org_xxx or ap_user_xxx
  owner_type: "org" | "user";
  owner_display: string; // Auto-filled from owner record
  controller_type: "org" | "person" | "api" | "user";
  claimed: boolean;
  spec_version?: string; // OAP specification version, defaults to "oap/1.0"

  // Agent Details
  role: string;
  description: string;
  capabilities: Capability[];
  limits: PassportLimits;
  regions: string[]; // ISO-3166 country codes

  // Status & Verification
  status: "draft" | "active" | "suspended" | "revoked";
  verification_status: "unverified" | "email_verified" | "github_verified";
  verification_method?: "email" | "github_oauth";
  verification_evidence?: {
    email?: string;
    github_username?: string;
    github_org?: string;
    verified_at?: string;
  };

  // Assurance (snapshot from owner)
  assurance_level: AssuranceLevel;
  assurance_method?: AssuranceMethod;
  assurance_verified_at?: string;

  // Contact & Links
  contact: string;
  links: {
    homepage?: string;
    docs?: string;
    repo?: string;
  };

  // Categorization & Metadata
  categories?: PassportCategory[];
  framework?: PassportFramework[];
  logo_url?: string;

  // System Metadata
  source: "admin" | "form" | "crawler";
  created_at: string;
  updated_at: string;
  version: string;
  model_info?: ModelInfo;

  // Issuance & Delegation
  issuer_type?: "user" | "org"; // Who issued this passport
  issued_by?: string; // User ID or Org ID who issued
  provisioned_by_org_id?: string; // Org that provisioned this (for delegated issuance)
  pending_owner?: {
    email?: string;
    github_username?: string;
  }; // For unclaimed passports
  sponsor_orgs?: string[]; // Organizations that remain as sponsors after claim

  // Registry Signature (for active passports)
  registry_key_id?: string; // e.g. "reg-2025-01"
  registry_sig?: string; // "ed25519:base64(<canonical-bytes>)"
  canonical_hash?: string; // "sha256:base64" of canonical JSON (no *sig fields)
  verified_at?: string; // ISO timestamp when registry_sig computed

  // MCP (Model Context Protocol) Support
  mcp?: {
    servers?: string[]; // e.g. ["https://mcp.stripe.com","urn:mcp:acme:helpdesk"]
    tools?: string[]; // e.g. ["stripe.refunds.create","notion.pages.export"]
  };

  // Policy Evaluation (computed on create/update)
  evaluation?: {
    pack_id: string; // e.g. "payments.refund.v1", "data.export.v1", "none"
    assurance_ok: boolean;
    capability_ok: boolean;
    limits_ok: boolean;
    regions_ok: boolean;
    mcp_ok: boolean;
    reasons: string[]; // Array of failure reasons
  };

  attestations?: Array<{
    type: AttestationType;
    issuer?: string; // domain or DID or PSP name
    reference?: string; // URL, tx id, mandate id, etc.
    claims?: Record<string, any>;
    signature?: string; // optional
    verified_at?: string;
  }>;

  // Template/Instance Support (additive fields)
  kind?: "template" | "instance"; // default "template" when absent
  parent_agent_id?: string; // instance -> template link
  platform_id?: string; // e.g. "gorgias", "zendesk"
  controller_id?: string; // tenant org/user that controls this instance
  tenant_ref?: string; // platform's tenant identifier
  creator_id?: string; // builder user/org who created the template
  creator_type?: "org" | "user";
  updated_from_parent_at?: string; // timestamp when instance was last updated from template
  webhook_url?: string;
  email?: string;

  // Helps correlate GitHub events to the right agent
  integrations?: {
    github?: {
      allowed_actors?: string[]; // e.g. ["my-bot[bot]","acme-ci"]
      allowed_apps?: string[]; // GitHub App slugs
    };
  };
}

export interface AttestationAdapter {
  type: "vc" | "did" | "ap2" | "oidc";
  verify(input: any): Promise<{ valid: boolean; fields: Record<string, any> }>;
  toPassport?(fields: Record<string, any>): Partial<PassportData>;
  fromPassport?(passport: PassportData): any; // produce spec-compliant payload
}

export interface CreatePassportRequest {
  // Core Identity (agent_id and slug are auto-generated)
  name: string;
  owner_id?: string; // Optional during migration
  controller_type: "org" | "person";

  // Agent Details
  role: string;
  description: string;
  capabilities?: Capability[]; // Optional during migration
  limits?: PassportLimits;
  regions: string[];

  // Status & Verification
  status: "draft" | "active" | "suspended" | "revoked";
  verification_status?: "unverified" | "verified";
  verification_method?: string;

  // Contact & Links
  contact: string;
  links?: {
    homepage?: string;
    docs?: string;
    repo?: string;
  };

  // Categorization & Metadata
  framework?: PassportFramework[]; // Allow any string during migration
  categories?: PassportCategory[]; // Allow any string during migration
  logo_url?: string;

  // System Metadata
  source?: "admin" | "form" | "crawler";
  version?: string;

  // API-specific fields (for backward compatibility)
  agent_id?: string; // Optional, will be auto-generated if not provided
  slug?: string; // Optional, will be auto-generated if not provided
  owner_type?: "org" | "user"; // Derived from owner_id
  assurance_level?: "L1" | "L2" | "L3"; // For API compatibility
  kind?: "template" | "instance"; // Template/Instance support
  template_id?: string; // Required for instances
  tags?: string[]; // Additional metadata
  metadata?: Record<string, any>; // Additional metadata
}

export interface UpdatePassportRequest {
  agent_id: string;
  name?: string;
  owner_id?: string;
  role?: string;
  description?: string;
  capabilities?: Capability[];
  limits?: PassportLimits;
  regions?: string[];
  contact?: string;
  links?: {
    homepage?: string;
    docs?: string;
    repo?: string;
  };
  framework?: PassportFramework[];
  categories?: PassportCategory[];
  logo_url?: string;
  status?: "draft" | "active" | "suspended" | "revoked";
  registry_key_id?: string; // e.g. "reg-2025-01"
  registry_sig?: string; // "base64:ed25519(<canonical-bytes>)"
  canonical_hash?: string; // "sha256:BASE64" of canonical JSON (no *sig fields)
  verified_at?: string; // ISO timestamp when registry_sig computed

  verification_evidence?: {
    // set by claim flows
    github_user?: string;
    org_id?: string;
    repo_ids?: string[];
    email?: string;
    verified_at: string;
  };

  manifest_hash?: string; // optional (v0.5)
  manifest_status?: "up_to_date" | "stale" | "missing";
}

export interface UpdateStatusRequest {
  agent_id: string;
  status: "draft" | "active" | "suspended" | "revoked";
}

export interface AgentSummary {
  agent_id: string;
  name: string;
  status: string;
  source: string;
  slug?: string;
}
