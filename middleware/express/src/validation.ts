/**
 * Validation utilities for Agent Passport middleware
 *
 * This module provides type-safe validation functions for agent IDs and policy IDs,
 * with comprehensive error handling and clear documentation for developers.
 */

import { Request } from "express";
import { AportError } from "@aporthq/sdk-node";

// Removed format validation patterns since IDs can change

/**
 * Validation result interface
 */
export interface ValidationResult<T> {
  /** Whether the validation passed */
  valid: boolean;
  /** The validated and normalized value */
  value?: T;
  /** Error details if validation failed */
  error?: {
    code: string;
    message: string;
    field?: string;
  };
}

/**
 * Agent ID validation options
 */
export interface AgentIDValidationOptions {
  /** Whether to allow legacy 'agents/' prefix */
  allowLegacyFormat?: boolean;
  /** Whether to normalize the agent ID format */
  normalize?: boolean;
  /** Custom error messages */
  messages?: {
    required?: string;
    invalid?: string;
  };
}

/**
 * Policy ID validation options
 */
export interface PolicyIDValidationOptions {
  /** Custom error messages */
  messages?: {
    required?: string;
    invalid?: string;
  };
}

/**
 * Validates an agent ID (basic validation only)
 *
 * @param agentId - The agent ID to validate
 * @param options - Validation options
 * @returns ValidationResult with normalized agent ID
 */
export function validateAgentIDFormat(
  agentId: string,
  options: AgentIDValidationOptions = {}
): ValidationResult<string> {
  const { allowLegacyFormat = true, normalize = true, messages = {} } = options;

  if (!agentId || typeof agentId !== "string") {
    return {
      valid: false,
      error: {
        code: "AGENT_ID_REQUIRED",
        message:
          messages.required || "Agent ID is required and must be a string",
        field: "agentId",
      },
    };
  }

  const trimmedId = agentId.trim();

  // Basic validation - just check it's not empty
  if (trimmedId.length === 0) {
    return {
      valid: false,
      error: {
        code: "AGENT_ID_REQUIRED",
        message: messages.required || "Agent ID cannot be empty",
        field: "agentId",
      },
    };
  }

  // Handle legacy format if needed
  if (allowLegacyFormat && trimmedId.startsWith("agents/")) {
    const withoutPrefix = trimmedId.replace("agents/", "");
    return {
      valid: true,
      value: normalize ? withoutPrefix : trimmedId,
    };
  }

  return {
    valid: true,
    value: normalize ? trimmedId : trimmedId,
  };
}

/**
 * Validates a policy ID (basic validation only)
 *
 * @param policyId - The policy ID to validate
 * @param options - Validation options
 * @returns ValidationResult with validated policy ID
 */
export function validatePolicyIDFormat(
  policyId: string,
  options: PolicyIDValidationOptions = {}
): ValidationResult<string> {
  const { messages = {} } = options;

  if (!policyId || typeof policyId !== "string") {
    return {
      valid: false,
      error: {
        code: "POLICY_ID_REQUIRED",
        message:
          messages.required || "Policy ID is required and must be a string",
        field: "policyId",
      },
    };
  }

  const trimmedId = policyId.trim();

  // Basic validation - just check it's not empty
  if (trimmedId.length === 0) {
    return {
      valid: false,
      error: {
        code: "POLICY_ID_REQUIRED",
        message: messages.required || "Policy ID cannot be empty",
        field: "policyId",
      },
    };
  }

  return {
    valid: true,
    value: trimmedId,
  };
}

/**
 * Extracts agent ID from Express request headers
 *
 * @param req - Express request object
 * @param options - Extraction options
 * @returns The extracted agent ID or null if not found
 *
 * @example
 * ```typescript
 * const agentId = extractAgentIDFromRequest(req);
 * if (agentId) {
 *   console.log('Found agent ID:', agentId);
 * }
 * ```
 */
export function extractAgentIDFromRequest(
  req: Request,
  options: { fallbackHeaders?: string[] } = {}
): string | null {
  const { fallbackHeaders = ["x-agent-id", "authorization"] } = options;

  // Primary header
  const primaryId = req.headers["x-agent-passport-id"] as string;
  if (primaryId) {
    return primaryId;
  }

  // Fallback headers
  for (const header of fallbackHeaders) {
    const value = req.headers[header] as string;
    if (value) {
      // Handle Authorization header with Bearer prefix
      if (header === "authorization" && value.startsWith("Bearer ")) {
        return value.slice(7);
      }
      return value;
    }
  }

  return null;
}

/**
 * Validates agent ID with fallback to request headers
 *
 * This is the main validation function that implements your approach:
 * 1. Prefer function parameter
 * 2. Fallback to X-Agent-Passport-Id header
 * 3. Fail if neither provided
 *
 * @param agentId - Optional agent ID parameter (preferred)
 * @param req - Express request object for header fallback
 * @param options - Validation options
 * @returns The validated and normalized agent ID
 * @throws AgentPassportError if validation fails
 *
 * @example
 * ```typescript
 * // Explicit agent ID (preferred)
 * const validatedId = validateAgentID('ap_a2d10232c6534523812423eec8a1425c45678');
 *
 * // Header fallback
 * const validatedId = validateAgentID(undefined, req);
 *
 * // Both (function parameter takes precedence)
 * const validatedId = validateAgentID('ap_a2d10232c6534523812423eec8a1425c45678', req);
 * ```
 */
export function validateAgentID(
  agentId?: string,
  req?: Request,
  options: AgentIDValidationOptions = {}
): string {
  // Step 1: Prefer function parameter
  if (agentId) {
    const result = validateAgentIDFormat(agentId, options);
    if (result.valid) {
      return result.value!;
    }
    throw new AportError(400, [
      { code: result.error!.code, message: result.error!.message },
    ]);
  }

  // Step 2: Fallback to header extraction
  if (req) {
    const extractedId = extractAgentIDFromRequest(req);
    if (extractedId) {
      const result = validateAgentIDFormat(extractedId, options);
      if (result.valid) {
        return result.value!;
      }
      throw new AportError(400, [
        { code: result.error!.code, message: result.error!.message },
      ]);
    }
  }

  // Step 3: Fail if neither provided
  throw new AportError(400, [
    {
      code: "AGENT_ID_REQUIRED",
      message:
        "Agent ID is required. Provide it as a function parameter or X-Agent-Passport-Id header.",
    },
  ]);
}

/**
 * Validates policy ID
 *
 * @param policyId - The policy ID to validate
 * @param options - Validation options
 * @returns The validated policy ID
 * @throws AgentPassportError if validation fails
 *
 * @example
 * ```typescript
 * const validatedPolicy = validatePolicy('finance.payment.refund.v1');
 * ```
 */
export function validatePolicy(
  policyId: string,
  options: PolicyIDValidationOptions = {}
): string {
  const result = validatePolicyIDFormat(policyId, options);

  if (!result.valid) {
    throw new AportError(400, [
      { code: result.error!.code, message: result.error!.message },
    ]);
  }

  return result.value!;
}

/**
 * Validates both agent ID and policy ID for policy-related calls
 *
 * This is a convenience function that validates both required parameters
 * for policy enforcement functions.
 *
 * @param agentId - Optional agent ID parameter (preferred)
 * @param policyId - The policy ID to validate
 * @param req - Express request object for header fallback
 * @param options - Validation options
 * @returns Object with validated agent ID and policy ID
 * @throws AgentPassportError if validation fails
 *
 * @example
 * ```typescript
 * const { agentId, policyId } = validatePolicyCall(
 *   'ap_a2d10232c6534523812423eec8a1425c45678',  // Optional explicit agent ID
 *   'finance.payment.refund.v1',        // Required policy ID
 *   req                   // Request for header fallback
 * );
 * ```
 */
export function validatePolicyCall(
  agentId: string | undefined,
  policyId: string,
  req?: Request,
  options: {
    agentOptions?: AgentIDValidationOptions;
    policyOptions?: PolicyIDValidationOptions;
  } = {}
): { agentId: string; policyId: string } {
  const validatedAgentId = validateAgentID(agentId, req, options.agentOptions);
  const validatedPolicyId = validatePolicy(policyId, options.policyOptions);

  return {
    agentId: validatedAgentId,
    policyId: validatedPolicyId,
  };
}

/**
 * Type guard to check if a value is a valid agent ID format
 *
 * @param value - Value to check
 * @returns True if the value is a valid agent ID format
 *
 * @example
 * ```typescript
 * if (isValidAgentIDFormat('ap_a2d10232c6534523812423eec8a1425c45678')) {
 *   // Safe to use as agent ID
 * }
 * ```
 */
export function isValidAgentIDFormat(value: any): value is string {
  if (typeof value !== "string") return false;
  const result = validateAgentIDFormat(value);
  return result.valid;
}

/**
 * Type guard to check if a value is a valid policy ID format
 *
 * @param value - Value to check
 * @returns True if the value is a valid policy ID format
 *
 * @example
 * ```typescript
 * if (isValidPolicyIDFormat('finance.payment.refund.v1')) {
 *   // Safe to use as policy ID
 * }
 * ```
 */
export function isValidPolicyIDFormat(value: any): value is string {
  if (typeof value !== "string") return false;
  const result = validatePolicyIDFormat(value);
  return result.valid;
}
