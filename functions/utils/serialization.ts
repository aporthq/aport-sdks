import { PassportData } from "../../types/passport";
import { extractCapabilityIdsFast } from "./capabilities";

/**
 * Pre-serialize passport data for edge performance
 * This creates a cached version that can be served directly without JSON.stringify()
 * OPTIMIZED: Pre-computes capability IDs for ultra-fast middleware
 */
export async function preSerializePassport(
  kv: KVNamespace,
  agentId: string,
  rawPassport: PassportData,
  version: string
): Promise<void> {
  const passport = buildPassportObject(rawPassport, version);

  // Pre-compute capability IDs for middleware performance
  const capabilityIds = extractCapabilityIdsFast(
    rawPassport.capabilities || []
  );

  const serializedJson = JSON.stringify(passport);
  const etag = generateETag(passport);
  const registryKeyId = `kv-${Date.now()}`;

  const serializedData = {
    json: serializedJson,
    etag: etag,
    registryKeyId: registryKeyId,
    timestamp: Date.now(),
    // Pre-computed for middleware performance
    capabilityIds: capabilityIds,
  };

  // Store pre-serialized version
  await kv.put(
    `passport_serialized:${agentId}`,
    JSON.stringify(serializedData),
    {
      expirationTtl: 3600,
    }
  );
}

/**
 * Invalidate pre-serialized passport cache
 * Used when passport is updated to ensure consistency
 */
export async function invalidateSerializedPassport(
  kv: KVNamespace,
  agentId: string
): Promise<void> {
  await kv.delete(`passport_serialized:${agentId}`);
}

/**
 * Build passport object from raw data with backward compatibility
 * OPTIMIZED: Single source of truth for passport serialization
 */
export function buildPassportObject(raw: PassportData, version: string): any {
  raw = typeof raw === "string" ? JSON.parse(raw) : raw;
  const passport: any = {
    agent_id: raw.agent_id,
    slug: raw.slug,
    name: raw.name,
    owner_id: raw.owner_id,
    owner_type: raw.owner_type,
    owner_display: raw.owner_display,
    controller_type: raw.controller_type,
    claimed: raw.claimed,
    role: raw.role,
    description: raw.description,
    capabilities: raw.capabilities || [],
    limits: raw.limits,
    regions: raw.regions,
    status: raw.status,
    verification_status: raw.verification_status,
    verification_method: raw.verification_method,
    verification_evidence: raw.verification_evidence,
    assurance_level: raw.assurance_level,
    assurance_method: raw.assurance_method,
    assurance_verified_at: raw.assurance_verified_at,
    contact: raw.contact,
    links: raw.links,
    categories: raw.categories,
    framework: raw.framework,
    logo_url: raw.logo_url,
    source: raw.source,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    version: raw.version || version,
    model_info: raw.model_info,
  };

  // Add issuance & delegation fields if they exist
  if (raw.issuer_type) passport.issuer_type = raw.issuer_type;
  if (raw.issued_by) passport.issued_by = raw.issued_by;
  if (raw.provisioned_by_org_id)
    passport.provisioned_by_org_id = raw.provisioned_by_org_id;
  if (raw.pending_owner) passport.pending_owner = raw.pending_owner;
  if (raw.sponsor_orgs) passport.sponsor_orgs = raw.sponsor_orgs;

  // Add signature context fields if they exist
  if (raw.registry_key_id) passport.registry_key_id = raw.registry_key_id;
  if (raw.canonical_hash) passport.canonical_hash = raw.canonical_hash;
  if (raw.registry_sig) passport.registry_sig = raw.registry_sig;
  if (raw.verified_at) passport.verified_at = raw.verified_at;

  // Add MCP support if it exists
  if (raw.mcp) passport.mcp = raw.mcp;

  // Add evaluation if it exists
  if (raw.evaluation) passport.evaluation = raw.evaluation;

  // Add template/instance fields if they exist
  if (raw.kind) passport.kind = raw.kind;
  if (raw.parent_agent_id) passport.parent_agent_id = raw.parent_agent_id;
  if (raw.platform_id) passport.platform_id = raw.platform_id;
  if (raw.controller_id) passport.controller_id = raw.controller_id;
  if (raw.controller_type) passport.controller_type = raw.controller_type;
  if (raw.tenant_ref) passport.tenant_ref = raw.tenant_ref;
  if (raw.creator_id) passport.creator_id = raw.creator_id;
  if (raw.creator_type) passport.creator_type = raw.creator_type;
  if (raw.updated_from_parent_at)
    passport.updated_from_parent_at = raw.updated_from_parent_at;

  // Add webhook and email fields if they exist
  if (raw.webhook_url) passport.webhook_url = raw.webhook_url;
  if (raw.email) passport.email = raw.email;

  // Add attestations if they exist
  if (raw.attestations) passport.attestations = raw.attestations;

  // Add integrations if they exist
  if (raw.integrations) passport.integrations = raw.integrations;

  return passport;
}

/**
 * Generate ETag from passport data for caching
 */
function generateETag(passport: any): string {
  const etagData = `${passport.agent_id}-${passport.updated_at}-${passport.version}`;
  return `W/"${btoa(etagData).replace(
    /[+/=]/g,
    (m: string) =>
      ({ "+": "-", "/": "_", "=": "" }[
        m as keyof { "+": string; "/": string; "=": string }
      ])
  )}"`;
}
