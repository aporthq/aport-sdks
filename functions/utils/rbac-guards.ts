import { OrgRole, PlatformRole, ApiKey, ApiKeyScope } from "../../types/auth";
import { AuthContext } from "../../types/auth";

/**
 * Role-based access control guards
 */

/**
 * Check if user has required organization role
 */
export function hasOrgRole(
  authContext: AuthContext,
  orgId: string,
  requiredRoles: OrgRole[]
): boolean {
  const userRoles = authContext.org_roles[orgId] || [];
  return requiredRoles.some((role) => userRoles.includes(role));
}

/**
 * Check if user has required platform role
 */
export function hasPlatformRole(
  authContext: AuthContext,
  requiredRoles: PlatformRole[]
): boolean {
  return requiredRoles.some((role) =>
    authContext.platform_roles.includes(role)
  );
}

/**
 * Check if user can manage organization members
 */
export function canManageOrgMembers(
  authContext: AuthContext,
  orgId: string
): boolean {
  return hasOrgRole(authContext, orgId, ["org_admin"]);
}

/**
 * Check if user can set issuer flag (registry admin only)
 */
export function canSetIssuerFlag(authContext: AuthContext): boolean {
  return hasPlatformRole(authContext, ["registry_admin"]);
}

/**
 * Check if user can generate org keys
 */
export function canGenerateOrgKey(
  authContext: AuthContext,
  orgId: string
): boolean {
  return hasOrgRole(authContext, orgId, ["org_admin"]);
}

/**
 * Check if user can issue for others
 */
export function canIssueForOthers(
  authContext: AuthContext,
  orgId: string,
  orgCanIssueForOthers: boolean
): boolean {
  return hasOrgRole(authContext, orgId, ["org_issuer"]) && orgCanIssueForOthers;
}

/**
 * Check if user can suspend/resume
 */
export function canSuspendResume(
  authContext: AuthContext,
  orgId: string
): boolean {
  return hasOrgRole(authContext, orgId, ["org_security", "org_admin"]);
}

/**
 * Check if user can manage API keys
 */
export function canManageApiKeys(
  authContext: AuthContext,
  ownerId: string,
  ownerType: "user" | "org"
): boolean {
  if (ownerType === "user") {
    // Users can only manage their own keys
    return authContext.user.user_id === ownerId;
  } else {
    // For org keys, need org_admin or org_security role
    return hasOrgRole(authContext, ownerId, ["org_admin", "org_security"]);
  }
}

/**
 * Check if API key has required scope
 */
export function hasApiKeyScope(
  apiKey: ApiKey,
  requiredScope: ApiKeyScope
): boolean {
  return apiKey.scopes.includes(requiredScope);
}

/**
 * Check if API key has any of the required scopes
 */
export function hasAnyApiKeyScope(
  apiKey: ApiKey,
  requiredScopes: ApiKeyScope[]
): boolean {
  return requiredScopes.some((scope) => apiKey.scopes.includes(scope));
}

/**
 * Check if API key can access organization resources
 */
export function canApiKeyAccessOrg(apiKey: ApiKey, orgId: string): boolean {
  // API key must belong to the organization
  return apiKey.owner_type === "org" && apiKey.owner_id === orgId;
}

/**
 * Check if API key can access user resources
 */
export function canApiKeyAccessUser(apiKey: ApiKey, userId: string): boolean {
  // API key must belong to the user
  return apiKey.owner_type === "user" && apiKey.owner_id === userId;
}

/**
 * Get required roles for different operations
 */
export const REQUIRED_ROLES = {
  // Organization management
  CREATE_ORG: [] as OrgRole[], // No specific role required for creation
  MANAGE_MEMBERS: ["org_admin"] as OrgRole[],
  SET_ISSUER_FLAG: [] as PlatformRole[], // Registry admin only
  GENERATE_ORG_KEY: ["org_admin"] as OrgRole[],
  SUSPEND_RESUME: ["org_security", "org_admin"] as OrgRole[],
  ISSUE_FOR_OTHERS: ["org_issuer"] as OrgRole[],

  // API key management
  MANAGE_USER_KEYS: [] as OrgRole[], // User can manage their own
  MANAGE_ORG_KEYS: ["org_admin", "org_security"] as OrgRole[],
} as const;

/**
 * Get required scopes for different operations
 */
export const REQUIRED_SCOPES = {
  ISSUE: ["issue"] as ApiKeyScope[],
  UPDATE: ["update"] as ApiKeyScope[],
  STATUS: ["status"] as ApiKeyScope[],
  READ: ["read"] as ApiKeyScope[],
  LIST_AGENTS: ["list_agents"] as ApiKeyScope[],
  READ_AUDIT: ["read_audit"] as ApiKeyScope[],
  MANAGE_WEBHOOKS: ["manage_webhooks"] as ApiKeyScope[],
  MANAGE_KEYS: ["manage_keys"] as ApiKeyScope[],
} as const;

/**
 * Check if user can suspend their own passports
 */
export function canSuspendOwnPassport(
  authContext: AuthContext,
  passportOwnerId: string
): boolean {
  return authContext.user.user_id === passportOwnerId;
}

/**
 * Check if user can update their own passports
 */
export function canUpdateOwnPassport(
  authContext: AuthContext,
  passportOwnerId: string
): boolean {
  return authContext.user.user_id === passportOwnerId;
}

/**
 * Check if organization can suspend passports where they are a sponsor
 */
export function canSuspendSponsoredPassport(
  authContext: AuthContext,
  orgId: string,
  sponsorOrgs: string[]
): boolean {
  // Check if user has admin/security role in the org AND the org is in sponsor_orgs
  return (
    hasOrgRole(authContext, orgId, ["org_admin", "org_security"]) &&
    sponsorOrgs.includes(orgId)
  );
}

/**
 * Error messages for RBAC failures
 */
export const RBAC_ERRORS = {
  INSUFFICIENT_ORG_ROLE: "Insufficient organization permissions",
  INSUFFICIENT_PLATFORM_ROLE: "Insufficient platform permissions",
  INSUFFICIENT_API_SCOPE: "API key lacks required scope",
  CANNOT_ACCESS_RESOURCE: "Cannot access this resource",
  ORG_NOT_FOUND: "Organization not found",
  USER_NOT_FOUND: "User not found",
  API_KEY_NOT_FOUND: "API key not found",
  API_KEY_REVOKED: "API key has been revoked",
  CANNOT_SUSPEND_PASSPORT:
    "Cannot suspend this passport - insufficient permissions",
  PASSPORT_NOT_SPONSORED: "Organization is not a sponsor of this passport",
} as const;
