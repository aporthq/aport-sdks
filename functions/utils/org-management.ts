import {
  EnhancedOrg,
  OrgMembership,
  OrgMember,
  OrgRole,
  ManageMemberRequest,
  OrgStatusRequest,
} from "../../types/auth";
import { PreviousAttestation } from "../../types/owner";
import { AssuranceLevel, AssuranceMethod } from "./assurance";
// Use Web Crypto API instead of Node.js crypto

/**
 * Generate organization ID
 */
export function generateOrgId(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(8));
  const hex = Array.from(randomBytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `ap_org_${hex}`;
}

/**
 * Check if user has permission to perform action on organization
 */
export function hasOrgPermission(
  userRole: OrgRole,
  action: "view" | "edit" | "admin" | "manage_members" | "manage_keys"
): boolean {
  const permissions: Partial<Record<OrgRole, string[]>> = {
    org_admin: ["view", "edit", "admin", "manage_members", "manage_keys"],
    org_issuer: ["view", "edit", "manage_keys"],
    org_member: ["view"],
    org_security: ["view", "edit", "admin", "manage_members"],
    org_billing: ["view", "edit"],
    org_auditor: ["view"],
  };

  return permissions[userRole]?.includes(action) || false;
}

/**
 * Check if user is organization admin
 */
export function isOrgAdmin(userRole: OrgRole): boolean {
  return userRole === "org_admin";
}

/**
 * Check if user can manage organization members
 */
export function canManageMembers(userRole: OrgRole): boolean {
  return userRole === "org_admin";
}

/**
 * Check if user can manage organization keys
 */
export function canManageKeys(userRole: OrgRole): boolean {
  return userRole === "org_admin" || userRole === "org_issuer";
}

/**
 * Create organization
 */
export async function createOrganization(
  kv: KVNamespace,
  name: string,
  contactEmail: string,
  creatorUserId: string,
  domain?: string
): Promise<EnhancedOrg> {
  const orgId = generateOrgId();
  const now = new Date().toISOString();

  // Create the organization
  const org: EnhancedOrg = {
    org_id: orgId,
    name,
    domain,
    contact_email: contactEmail,
    can_issue_for_others: false,
    assurance_level: "L0",
    created_at: now,
    updated_at: now,
    members: [],
  };

  // Store organization
  await kv.put(`org:${orgId}`, JSON.stringify(org));

  // Add creator as org_admin
  await addOrgMember(kv, orgId, creatorUserId, "org_admin", creatorUserId);

  return org;
}

/**
 * Get organization by ID
 */
export async function getOrganization(
  kv: KVNamespace,
  orgId: string
): Promise<EnhancedOrg | null> {
  const data = await kv.get(`org:${orgId}`, "json");
  return data as EnhancedOrg | null;
}

/**
 * Add member to organization
 */
export async function addOrgMember(
  kv: KVNamespace,
  orgId: string,
  userId: string,
  role: OrgRole,
  addedBy: string
): Promise<void> {
  const now = new Date().toISOString();

  // Create membership edge
  const membership: OrgMembership = {
    org_id: orgId,
    user_id: userId,
    role,
    added_at: now,
    added_by: addedBy,
  };

  // Store membership edge
  await kv.put(`membership:org:${orgId}:${userId}`, JSON.stringify(membership));

  // Update user's organization list
  const userOrgs =
    ((await kv.get(`user_orgs:${userId}`, "json")) as OrgMember[]) || [];
  // Remove existing membership if any
  const filteredOrgs = userOrgs.filter((m) => m.org_id !== orgId);
  // Add new membership
  filteredOrgs.push(membership);
  await kv.put(`user_orgs:${userId}`, JSON.stringify(filteredOrgs));

  // Update organization members list
  const org = await getOrganization(kv, orgId);
  if (org) {
    // Remove existing membership if any
    org.members = org.members.filter((m) => m.user_id !== userId);
    // Add new membership
    org.members.push(membership);
    org.updated_at = now;

    await kv.put(`org:${orgId}`, JSON.stringify(org));
  }
}

/**
 * Remove member from organization
 */
export async function removeOrgMember(
  kv: KVNamespace,
  orgId: string,
  userId: string
): Promise<void> {
  // Remove membership edge
  await kv.delete(`membership:org:${orgId}:${userId}`);

  // Update user's organization list
  const userOrgs =
    ((await kv.get(`user_orgs:${userId}`, "json")) as OrgMember[]) || [];
  const filteredOrgs = userOrgs.filter((m) => m.org_id !== orgId);
  await kv.put(`user_orgs:${userId}`, JSON.stringify(filteredOrgs));

  // Update organization members list
  const org = await getOrganization(kv, orgId);
  if (org) {
    org.members = org.members.filter((m) => m.user_id !== userId);
    org.updated_at = new Date().toISOString();

    await kv.put(`org:${orgId}`, JSON.stringify(org));
  }
}

/**
 * Update member role
 */
export async function updateMemberRole(
  kv: KVNamespace,
  orgId: string,
  userId: string,
  newRole: OrgRole,
  updatedBy: string
): Promise<void> {
  const now = new Date().toISOString();

  // Update membership edge
  const membership: OrgMembership = {
    org_id: orgId,
    user_id: userId,
    role: newRole,
    added_at: now, // Keep original added_at
    added_by: updatedBy,
  };

  await kv.put(`membership:org:${orgId}:${userId}`, JSON.stringify(membership));

  // Update user's organization list
  const userOrgs =
    ((await kv.get(`user_orgs:${userId}`, "json")) as OrgMember[]) || [];
  const memberIndex = userOrgs.findIndex((m) => m.org_id === orgId);
  if (memberIndex !== -1) {
    userOrgs[memberIndex] = membership;
  } else {
    userOrgs.push(membership);
  }
  await kv.put(`user_orgs:${userId}`, JSON.stringify(userOrgs));

  // Update organization members list
  const org = await getOrganization(kv, orgId);
  if (org) {
    const memberIndex = org.members.findIndex((m) => m.user_id === userId);
    if (memberIndex !== -1) {
      org.members[memberIndex] = membership;
      org.updated_at = now;

      await kv.put(`org:${orgId}`, JSON.stringify(org));
    }
  }
}

/**
 * Get organization members
 */
export async function getOrgMembers(
  kv: KVNamespace,
  orgId: string
): Promise<OrgMembership[]> {
  const { keys } = await kv.list({
    prefix: `membership:org:${orgId}:`,
  });

  const members: OrgMembership[] = [];

  for (const key of keys) {
    const data = await kv.get(key.name, "json");
    if (data) {
      members.push(data as OrgMembership);
    }
  }

  return members;
}

/**
 * Get user's organizations
 */
export async function getUserOrganizations(
  kv: KVNamespace,
  userId: string
): Promise<OrgMembership[]> {
  const { keys } = await kv.list({
    prefix: `membership:user:${userId}:`,
  });

  const memberships: OrgMembership[] = [];

  for (const key of keys) {
    const data = await kv.get(key.name, "json");
    if (data) {
      memberships.push(data as OrgMembership);
    }
  }

  return memberships;
}

/**
 * Check if user has role in organization
 */
export async function hasOrgRole(
  kv: KVNamespace,
  userId: string,
  orgId: string,
  requiredRoles: OrgRole[]
): Promise<boolean> {
  const membership = (await kv.get(
    `membership:org:${orgId}:${userId}`,
    "json"
  )) as OrgMembership | null;

  if (!membership) {
    return false;
  }

  return requiredRoles.includes(membership.role);
}

/**
 * Set organization issuer flag
 */
export async function setOrgIssuerFlag(
  kv: KVNamespace,
  orgId: string,
  canIssueForOthers: boolean
): Promise<void> {
  const org = await getOrganization(kv, orgId);
  if (org) {
    org.can_issue_for_others = canIssueForOthers;
    org.updated_at = new Date().toISOString();

    await kv.put(`org:${orgId}`, JSON.stringify(org));
  }
}

/**
 * Generate organization key for suspension
 */
export async function generateOrgKey(
  kv: KVNamespace,
  orgId: string
): Promise<{ org_key_id: string; secret: string }> {
  const randomBytes1 = crypto.getRandomValues(new Uint8Array(16));
  const orgKeyId = `orgkey_${Array.from(randomBytes1, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")}`;

  const randomBytes2 = crypto.getRandomValues(new Uint8Array(32));
  const secret = btoa(String.fromCharCode(...randomBytes2))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const encoder = new TextEncoder();
  const data = encoder.encode(secret);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const secretHash = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const org = await getOrganization(kv, orgId);
  if (org) {
    org.org_key_id = orgKeyId;
    org.org_key_hash = secretHash;
    org.updated_at = new Date().toISOString();

    await kv.put(`org:${orgId}`, JSON.stringify(org));

    // Store org key for authentication
    await kv.put(
      `orgkey:${orgKeyId}`,
      JSON.stringify({
        org_id: orgId,
        hash: secretHash,
        created_at: new Date().toISOString(),
      })
    );
  }

  return { org_key_id: orgKeyId, secret };
}

/**
 * Authenticate organization key
 */
export async function authenticateOrgKey(
  kv: KVNamespace,
  orgKeyId: string,
  secret: string
): Promise<{ org_id: string } | null> {
  const orgKeyData = (await kv.get(`orgkey:${orgKeyId}`, "json")) as any;
  if (!orgKeyData) {
    return null;
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(secret);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const secretHash = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (orgKeyData.hash !== secretHash) {
    return null;
  }

  return { org_id: orgKeyData.org_id };
}

/**
 * Update organization status (active/suspended)
 */
export async function updateOrgStatus(
  kv: KVNamespace,
  orgId: string,
  status: "active" | "suspended"
): Promise<void> {
  const org = await getOrganization(kv, orgId);
  if (org) {
    // Add status field to org (extending the interface)
    (org as any).status = status;
    org.updated_at = new Date().toISOString();

    await kv.put(`org:${orgId}`, JSON.stringify(org));
  }
}

/**
 * Check if user can issue for others
 */
export async function canIssueForOthers(
  kv: KVNamespace,
  userId: string,
  orgId: string
): Promise<boolean> {
  // Check if user has org_issuer role
  const hasIssuerRole = await hasOrgRole(kv, userId, orgId, ["org_issuer"]);
  if (!hasIssuerRole) {
    return false;
  }

  // Check if org has can_issue_for_others flag
  const org = await getOrganization(kv, orgId);
  return org?.can_issue_for_others === true;
}

/**
 * Check if user can suspend/resume
 */
export async function canSuspendResume(
  kv: KVNamespace,
  userId: string,
  orgId: string
): Promise<boolean> {
  return hasOrgRole(kv, userId, orgId, ["org_security", "org_admin"]);
}

/**
 * Update organization assurance level
 */
export async function updateOrgAssuranceLevel(
  kv: KVNamespace,
  orgId: string,
  newAssuranceLevel: AssuranceLevel,
  newAssuranceMethod: AssuranceMethod,
  updatedBy: string,
  reason?: string
): Promise<void> {
  const org = await getOrganization(kv, orgId);
  if (!org) {
    throw new Error("Organization not found");
  }

  const now = new Date().toISOString();

  // Track previous assurance level if it's changing
  let previousAttestations = org.previous_attestations || [];
  if (org.assurance_level !== newAssuranceLevel) {
    const previousAttestation: PreviousAttestation = {
      attestation_id: `prev_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 8)}`,
      assurance_level: org.assurance_level,
      assurance_method: org.assurance_method || "self_attested",
      assurance_verified_at: org.assurance_verified_at || now,
      attested_at: now,
      attested_by: updatedBy,
      attested_reason: reason || "Organization assurance level updated",
      attested_evidence: {
        type: "previous_level",
        value: org.assurance_level,
        verified_at: org.assurance_verified_at || now,
        metadata: {
          previous_method: org.assurance_method || "self_attested",
        },
      },
      status: "verified",
      previous_assurance_level: org.assurance_level,
    };

    previousAttestations = [...previousAttestations, previousAttestation];
  }

  // Update organization
  const updatedOrg: EnhancedOrg = {
    ...org,
    assurance_level: newAssuranceLevel,
    assurance_method: newAssuranceMethod,
    assurance_verified_at: now,
    updated_at: now,
    previous_attestations: previousAttestations,
  };

  await kv.put(`org:${orgId}`, JSON.stringify(updatedOrg));
}
