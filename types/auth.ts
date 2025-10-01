/**
 * Authentication Types and Interfaces
 *
 * This module defines all authentication-related types for the agent passport system.
 */

import { KVNamespace } from "@cloudflare/workers-types";

export type AuthProvider = "github" | "email";

export type PlatformRole = "registry_admin";

export type AssuranceLevel = "L0" | "L1" | "L2" | "L3" | "L4KYC" | "L4FIN";

export type AssuranceMethod =
  | "self_attested"
  | "email_verified"
  | "github_verified"
  | "domain_verified"
  | "kyc_verified"
  | "kyb_verified"
  | "financial_data_verified";

/**
 * User entity
 */
// Re-export User from owner.ts to maintain DRY principles
import { User, OrgRole, OrgMembership } from "./owner";
export type { User } from "./owner";
export type { OrgRole } from "./owner";

/**
 * Organization entity (re-exported from owner.ts)
 */
import { Org } from "./auth";
export type { Organization as Org } from "./owner";

/**
 * Organization membership (re-exported from owner.ts)
 */
export type { OrgMember } from "./owner";

/**
 * JWT Payload
 */
export interface JWTPayload {
  sub: string; // user_id
  session_id?: string; // session ID for session lookup
  iat: number; // issued at
  exp: number; // expires at
  provider: AuthProvider; // how they logged in
  assurance_level: AssuranceLevel;
  turnstile_verified?: boolean;
  org_roles?: Record<string, OrgRole[]>; // org_id -> roles
  platform_roles?: PlatformRole[];
}

/**
 * Session data stored in KV
 */
export interface SessionData {
  user_id: string;
  provider: AuthProvider;
  created_at: string;
  last_used_at: string;
  ip_address: string;
  user_agent: string;
  turnstile_verified: boolean;
}

/**
 * Refresh token data stored in KV
 */
export interface RefreshTokenData {
  user_id: string;
  session_id: string;
  created_at: string;
  expires_at: string;
  ip_address: string;
  user_agent: string;
}

/**
 * GitHub OAuth callback data
 */
export interface GitHubCallbackData {
  code: string;
  state?: string;
}

/**
 * GitHub user data from API
 */
export interface GitHubUserData {
  id: number;
  login: string;
  name?: string;
  email?: string;
  avatar_url?: string;
}

/**
 * Email magic link request
 */
export interface EmailAuthRequest {
  email: string;
  turnstile_token?: string;
  return_url?: string;
}

/**
 * Email magic link callback data
 */
export interface EmailCallbackData {
  token: string;
}

/**
 * Auth context for middleware
 */
export interface AuthContext {
  user: User;
  session: SessionData;
  org_roles: Record<string, OrgRole[]>;
  platform_roles: PlatformRole[];
}

/**
 * Turnstile verification result
 */
export interface TurnstileVerificationResult {
  success: boolean;
  error_codes?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Auth configuration
 */
export interface AuthConfig {
  jwt_secret: string;
  jwt_algorithm: "HS256" | "EdDSA";
  jwt_expires_in: number; // seconds
  refresh_expires_in: number; // seconds
  github_client_id: string;
  github_client_secret: string;
  github_redirect_uri: string;
  turnstile_secret_key?: string;
  email_provider: "resend" | "ses";
  email_api_key?: string;
  email_from: string;
}

/**
 * API Key scopes
 */
export type ApiKeyScope =
  | "issue"
  | "update"
  | "status"
  | "read"
  | "list_agents"
  | "read_audit"
  | "manage_webhooks"
  | "manage_keys"
  | "admin"
  | "monitoring";

/**
 * API Key owner types
 */
export type ApiKeyOwnerType = "user" | "org";

/**
 * API Key status
 */
export type ApiKeyStatus = "active" | "revoked" | "suspended";

/**
 * API Key entity
 */
export interface ApiKey {
  key_id: string;
  owner_id: string;
  owner_type: ApiKeyOwnerType;
  scopes: ApiKeyScope[];
  hash: string; // HMAC/Argon2 hash of the actual key
  created_at: string;
  last_used_at?: string;
  status: ApiKeyStatus;
  name?: string; // Optional human-readable name
}

/**
 * API Key creation request
 */
export interface CreateApiKeyRequest {
  owner_id: string;
  owner_type: ApiKeyOwnerType;
  scopes: ApiKeyScope[];
  name?: string;
}

/**
 * API Key creation response
 */
export interface CreateApiKeyResponse {
  key_id: string;
  key: string; // Only shown once on creation
  owner_id: string;
  owner_type: ApiKeyOwnerType;
  scopes: ApiKeyScope[];
  created_at: string;
  name?: string;
}

/**
 * API Key list response (without the actual key)
 */
export interface ApiKeyListItem {
  key_id: string;
  owner_id: string;
  owner_type: ApiKeyOwnerType;
  scopes: ApiKeyScope[];
  created_at: string;
  last_used_at?: string;
  status: ApiKeyStatus;
  name?: string;
  key_prefix: string; // First 8 characters for identification
}

/**
 * Organization membership edge
 */

export type OrgStatus = "active" | "suspended" | "revoked";
/**
 * Organization with enhanced features
 */
export interface EnhancedOrg extends Org {
  can_issue_for_others?: boolean;
  org_key_id?: string;
  org_key_hash?: string; // HMAC key hash for org-suspend
  members: OrgMembership[]; // Use edge-based membership
  user_role?: OrgRole; // Current user's role in this organization
  assurance_method?: AssuranceMethod;
  assurance_verified_at?: string;
  previous_attestations?: any[];
  status?: OrgStatus;
}

/**
 * Organization member management request
 */
export interface ManageMemberRequest {
  user_id: string;
  role: OrgRole;
}

/**
 * Organization status update request (for suspension)
 */
export interface OrgStatusRequest {
  status: OrgStatus;
}

/**
 * Organization status response
 */
export interface OrgStatusResponse {
  org_id: string;
  status: OrgStatus;
  updated_at: string;
}

/**
 * Organization key response
 */
export interface OrgKeyResponse {
  org_key_id: string;
  secret: string;
}

/**
 * Set issuer flag request
 */
export interface SetIssuerFlagRequest {
  can_issue_for_others: boolean;
}

/**
 * Auth environment variables
 */
export interface AuthEnv {
  ai_passport_registry: KVNamespace;
  JWT_SECRET: string;
  JWT_ALGORITHM?: "HS256" | "EdDSA";
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_REDIRECT_URI: string;
  TURNSTILE_SECRET_KEY?: string;
  EMAIL_PROVIDER?: "resend" | "ses";
  EMAIL_API_KEY?: string;
  EMAIL_FROM: string;
  APP_NAME?: string;
  APP_BASE_URL?: string;
  RESEND_API_KEY?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_REGION?: string;
  REGISTRY_PRIVATE_KEY?: string;
  REGISTRY_KEY_ID?: string;
  AP_VERSION?: string;
  ADMIN_TOKEN?: string;
}
