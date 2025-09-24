/**
 * Auth Types for Node.js SDK
 *
 * This module defines authentication-related types for the agent passport system.
 * This is a Node.js-specific version that excludes Cloudflare Workers types.
 */

/**
 * Assurance levels for agent verification
 */
export type AssuranceLevel = "L0" | "L1" | "L2" | "L3" | "L4KYC" | "L4FIN";

/**
 * Assurance methods for verification
 */
export type AssuranceMethod =
  | "self_attested"
  | "email_verified"
  | "github_verified"
  | "domain_verified"
  | "kyc_verified"
  | "kyb_verified"
  | "financial_data_verified";

/**
 * JWT Algorithm types
 */
export type JWTAlgorithm = "HS256" | "EdDSA";

/**
 * Auth configuration for Node.js environments
 */
export interface AuthConfig {
  jwtSecret: string;
  jwtAlgorithm?: JWTAlgorithm;
  githubClientId?: string;
  githubClientSecret?: string;
  githubRedirectUri?: string;
  appBaseUrl?: string;
}
