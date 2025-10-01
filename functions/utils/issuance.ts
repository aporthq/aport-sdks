import { PassportData } from "../../types/passport";
import { EnhancedOrg } from "../../types/auth";
import { KVNamespace, R2Bucket } from "@cloudflare/workers-types";
import { preSerializePassport, buildPassportObject } from "./serialization";
import { signPassport } from "./signing";
import { purgeVerifyCache } from "./cache-purge";
import {
  computePassportDiffs,
  createAuditAction,
  completeAuditAction,
  storeAuditAction,
  getLastActionHash,
} from "./audit-trail";
import { getOrganization } from "./org-management";
import {
  validateAndResolveOwner,
  updateOwnerAgentsIndex,
  updateOrgAgentsIndex,
} from "./owner-utils";
import {
  generateAgentId,
  generateSlug,
  normalizeName,
  findUniqueSlug,
  isNameUnique,
  updateIndexes,
} from "./passport-common";
import { generateTemplateId, generateInstanceId } from "./template-instance";
import { validateMCPConfig } from "./mcp-validation";
import { computePassportEvaluation } from "./policy-evaluation";

export interface IssuanceRequest extends PassportData {}

export interface IssuanceContext {
  issuer_type: "user" | "org";
  issued_by: string; // User ID or Org ID
  provisioned_by_org_id?: string; // For delegated issuance
  owner_id?: string; // For self-serve issuance
  sponsor_orgs?: string[]; // For sponsor visibility
}

export interface IssuanceResult {
  agent_id: string;
  passport: PassportData;
  claimed: boolean;
  message: string;
}

// Note: These functions are now imported from admin/create.ts to avoid duplication
// They should be moved to a shared utilities file in the future

/**
 * Create a passport from issuance request
 */
export function createPassportFromRequest(
  request: IssuanceRequest,
  context: IssuanceContext,
  agentId: string
): PassportData {
  const now = new Date().toISOString();
  const slug = generateSlug(request.name);

  // Determine if passport is claimed based on context
  const claimed = context.issuer_type === "user" && !request.pending_owner;

  return {
    // Core Identity
    agent_id: agentId,
    slug,
    name: request.name,
    owner_id: request.owner_id || context.owner_id || "",
    owner_type:
      request.owner_type || (context.issuer_type === "org" ? "org" : "user"),
    owner_display: request.owner_display || "", // Will be populated from owner record if empty
    controller_type: request.controller_type || "person",
    claimed,

    // Agent Details
    role: request.role,
    description: request.description,
    capabilities: request.capabilities || [],
    limits: request.limits || ({} as any),
    regions: request.regions,

    // Status & Verification
    status: request.status || "active",
    verification_status: claimed ? "email_verified" : "unverified",
    verification_method: claimed ? "email" : undefined,
    verification_evidence: claimed
      ? {
          email: context.issued_by,
          verified_at: now,
        }
      : undefined,

    // Assurance (from issuer)
    assurance_level: "L0", // Will be updated from owner during claim
    assurance_method: "self_declared" as any,
    assurance_verified_at: claimed ? now : undefined,

    // Contact & Links
    contact: request.contact,
    links: request.links || {},

    // Categorization & Metadata
    categories: (request.categories || []) as any[],
    framework: (request.framework || []) as any[],
    logo_url: request.logo_url,

    // MCP (Model Context Protocol) Support
    mcp: request.mcp,

    // System Metadata
    source: "form",
    created_at: now,
    updated_at: now,
    version: "0.1",

    // Issuance & Delegation
    issuer_type: context.issuer_type,
    issued_by: context.issued_by,
    provisioned_by_org_id: context.provisioned_by_org_id,
    pending_owner: request.pending_owner,
    sponsor_orgs: context.sponsor_orgs || [],

    // Template/Instance Support
    kind: request.kind || "template",
    creator_id: request.creator_id || context.issued_by,
    creator_type: request.creator_type || context.issuer_type,
  };
}

/**
 * Process passport issuance with common logic
 * Improved to follow admin create patterns for consistency
 */
export async function processIssuance(
  request: IssuanceRequest,
  context: IssuanceContext,
  env: {
    ai_passport_registry: KVNamespace;
    PASSPORT_SNAPSHOTS_BUCKET?: R2Bucket;
    AP_VERSION: string;
    REGISTRY_PRIVATE_KEY?: string;
    APP_BASE_URL?: string;
    CLOUDFLARE_API_TOKEN?: string;
    CLOUDFLARE_ZONE_ID?: string;
  }
): Promise<IssuanceResult> {
  // Generate unique agent ID and slug based on kind
  const agentId =
    request.kind === "template"
      ? generateTemplateId()
      : request.kind === "instance"
      ? generateInstanceId()
      : generateAgentId(request.name, context.issued_by);
  const baseSlug = generateSlug(request.name);
  const normalizedName = normalizeName(request.name);
  const key = `passport:${agentId}`;

  // Check if passport already exists
  const existingPassport = await env.ai_passport_registry.get(key, "json");
  if (existingPassport) {
    throw new Error("Agent with this name already exists");
  }

  // Find unique slug
  const slug = await findUniqueSlug(baseSlug, env.ai_passport_registry);

  // Check name uniqueness
  const nameIsUnique = await isNameUnique(
    normalizedName,
    env.ai_passport_registry
  );
  if (!nameIsUnique) {
    console.log(
      `Warning: Name "${request.name}" is not unique, but allowing creation`
    );
  }

  // Resolve owner information for self-serve issuance
  let ownerInfo = null;
  if (context.owner_id) {
    const ownerType = context.owner_id.startsWith("ap_org_") ? "org" : "user";
    const ownerValidation = await validateAndResolveOwner(
      env.ai_passport_registry,
      context.owner_id,
      ownerType
    );
    if (ownerValidation.valid) {
      ownerInfo = ownerValidation.ownerInfo;
    }
  }

  // Validate MCP configuration if provided
  if (request.mcp) {
    const mcpValidation = validateMCPConfig(request.mcp);
    if (!mcpValidation.valid) {
      throw new Error(
        `MCP validation failed: ${mcpValidation.errors.join(", ")}`
      );
    }
    // Use sanitized MCP data
    request.mcp = mcpValidation.sanitized;
  }

  // Create passport with proper owner information
  const passport = createPassportFromRequest(request, context, agentId);

  // Update passport with resolved owner info
  if (ownerInfo) {
    passport.owner_display = ownerInfo.owner_display;
    passport.assurance_level = ownerInfo.assurance_level as any;
    passport.assurance_method = ownerInfo.assurance_method as any;
    passport.assurance_verified_at = ownerInfo.assurance_verified_at;
  }

  // Compute policy evaluation
  try {
    const evaluation = await computePassportEvaluation(
      passport,
      env.ai_passport_registry
    );
    passport.evaluation = evaluation;
  } catch (error) {
    console.warn("Failed to compute policy evaluation:", error);
    // Continue without evaluation - passport will be created but without policy checks
  }

  // Auto-sign if status is active
  if (passport.status === "active" && env.REGISTRY_PRIVATE_KEY) {
    try {
      const signedPassport = await signPassport(
        passport,
        env.REGISTRY_PRIVATE_KEY,
        "registry-key-1" // Default key ID
      );
      Object.assign(passport, signedPassport);
    } catch (error) {
      console.warn("Failed to sign passport:", error);
      // Continue without signature
    }
  }

  // Create audit action with proper diff computation
  const changes = computePassportDiffs(null, passport);
  const auditAction = await createAuditAction(
    "create",
    agentId,
    context.issued_by,
    changes,
    `Passport issued via ${context.issuer_type} issuance`
  );

  const prevHash = await getLastActionHash(env.ai_passport_registry, agentId);
  const completedAuditAction = await completeAuditAction(
    auditAction,
    prevHash,
    env.REGISTRY_PRIVATE_KEY || ""
  );

  // Store passport data and create indexes
  const storagePromises = [
    env.ai_passport_registry.put(key, JSON.stringify(passport)),
    updateIndexes(env.ai_passport_registry, agentId, slug, normalizedName),
    preSerializePassport(
      env.ai_passport_registry,
      agentId,
      passport,
      env.AP_VERSION || "1.0.0"
    ),
    storeAuditAction(env.ai_passport_registry, completedAuditAction),
  ];

  // Add owner index updates for self-serve issuance
  if (passport.owner_id) {
    storagePromises.push(
      updateOwnerAgentsIndex(
        env.ai_passport_registry,
        passport.owner_id,
        agentId,
        "add"
      )
    );

    if (passport.owner_type === "org") {
      storagePromises.push(
        updateOrgAgentsIndex(
          env.ai_passport_registry,
          passport.owner_id,
          agentId,
          "add"
        )
      );
    }
  }

  // Add R2 snapshot creation if bucket is available
  if (env.PASSPORT_SNAPSHOTS_BUCKET) {
    const passportObject = buildPassportObject(
      passport,
      env.AP_VERSION || "1.0.0"
    );
    const r2Key = `passports/${agentId}.json`;
    storagePromises.push(
      env.PASSPORT_SNAPSHOTS_BUCKET.put(r2Key, JSON.stringify(passportObject), {
        httpMetadata: {
          contentType: "application/json",
          cacheControl: "public, max-age=300",
        },
      }).then(() => {})
    );
  }

  // Execute all storage operations
  await Promise.all(storagePromises);

  // Purge verify cache
  await purgeVerifyCache(
    agentId,
    env.APP_BASE_URL || "https://aport.io",
    env.CLOUDFLARE_API_TOKEN,
    env.CLOUDFLARE_ZONE_ID
  );

  return {
    agent_id: agentId,
    passport,
    claimed: passport.claimed,
    message: passport.claimed
      ? "Passport issued and claimed successfully"
      : "Passport issued and ready for claim",
  };
}

/**
 * Get owner assurance level for passport updates
 */
export async function getOwnerAssurance(
  ownerId: string,
  registry: KVNamespace,
  baseUrl?: string
): Promise<{ level: string; method: string }> {
  // Check if owner is an organization
  if (ownerId.startsWith("ap_org_")) {
    const org = await getOrganization(registry, ownerId);
    if (org) {
      return {
        level: org.assurance_level || "L0",
        method: "org_verified",
      };
    }
  }

  // Default for users
  return {
    level: "L0",
    method: "self_declared",
  };
}

/**
 * Update passport with owner information during claim
 */
export async function updatePassportWithOwner(
  passport: PassportData,
  ownerId: string,
  registry: KVNamespace
): Promise<PassportData> {
  const assurance = await getOwnerAssurance(ownerId, registry);
  const now = new Date().toISOString();

  return {
    ...passport,
    owner_id: ownerId,
    owner_type: ownerId.startsWith("ap_org_") ? "org" : "user",
    claimed: true,
    assurance_level: assurance.level as any,
    assurance_method: assurance.method as any,
    assurance_verified_at: now,
    updated_at: now,
    // Clear pending owner
    pending_owner: undefined,
  };
}
