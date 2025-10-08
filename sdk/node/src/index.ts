/**
 * APort Node.js SDK - Thin Client
 *
 * This SDK provides a thin client interface to the APort API.
 * All policy logic, counters, and enforcement happens on the server side.
 */

// Export the thin client
export { APortClient, PolicyVerifier } from "./thin-client";
export type { APortClientOptions } from "./thin-client";

// Export error types
export { AportError } from "./errors";

// Export shared types
export type {
  Decision,
  DecisionReason,
  VerificationContext,
  PolicyVerificationRequest,
  PolicyVerificationResponse,
  Jwks,
} from "./types/decision";

// Re-export PassportData for compatibility
export type { PassportData } from "./types/passport";
