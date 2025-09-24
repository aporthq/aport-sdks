/**
 * Assurance Enforcement SDK for Agent Passport
 *
 * Provides minimum assurance level enforcement with performance optimizations
 * for edge computing environments.
 */

import {
  meetsMinimumAssurance,
  getAssuranceLevelMetadata,
  isAssuranceExpired,
  assuranceValidator,
  AssuranceLevel,
} from "../../../functions/utils/assurance";

/**
 * Assurance enforcement configuration
 */
export interface AssuranceEnforcementConfig {
  enabled: boolean;
  strictMode: boolean; // If true, reject requests that don't meet minimum assurance
  logViolations: boolean; // Log assurance violations for monitoring
  defaultMinimum?: AssuranceLevel; // Default minimum assurance level
  routeRequirements?: Record<string, AssuranceLevel>; // Route-specific requirements
}

/**
 * Default assurance enforcement configuration
 */
export const DEFAULT_ASSURANCE_CONFIG: AssuranceEnforcementConfig = {
  enabled: true,
  strictMode: true,
  logViolations: true,
  defaultMinimum: "L0",
  routeRequirements: {},
};

/**
 * Assurance enforcement result
 */
export interface AssuranceEnforcementResult {
  allowed: boolean;
  violations: Array<{
    type: string;
    reason: string;
    required?: AssuranceLevel;
    actual?: AssuranceLevel;
  }>;
  assuranceLevel: AssuranceLevel | null;
  isExpired: boolean;
  metadata: any;
}

/**
 * Check if agent meets minimum assurance requirements
 */
export function checkAssuranceRequirements(
  agent: any,
  requiredLevel: AssuranceLevel,
  config: Partial<AssuranceEnforcementConfig> = {}
): AssuranceEnforcementResult {
  const finalConfig = { ...DEFAULT_ASSURANCE_CONFIG, ...config };

  if (!finalConfig.enabled) {
    return {
      allowed: true,
      violations: [],
      assuranceLevel: null,
      isExpired: false,
      metadata: {},
    };
  }

  const violations: Array<{
    type: string;
    reason: string;
    required?: AssuranceLevel;
    actual?: AssuranceLevel;
  }> = [];

  if (!agent || !agent.assurance_level) {
    violations.push({
      type: "no_assurance",
      reason: "No assurance level configured for this agent",
    });
    return {
      allowed: !finalConfig.strictMode,
      violations,
      assuranceLevel: null,
      isExpired: false,
      metadata: {},
    };
  }

  const agentLevel = agent.assurance_level;
  const metadata = getAssuranceLevelMetadata(agentLevel);
  const isExpired = isAssuranceExpired(agent);

  if (isExpired) {
    violations.push({
      type: "assurance_expired",
      reason: "Agent assurance has expired",
      actual: agentLevel,
    });
  }

  if (!meetsMinimumAssurance(agentLevel, requiredLevel)) {
    violations.push({
      type: "insufficient_assurance",
      reason: `Agent assurance level ${agentLevel} does not meet required level ${requiredLevel}`,
      required: requiredLevel,
      actual: agentLevel,
    });
  }

  return {
    allowed: violations.length === 0,
    violations,
    assuranceLevel: agentLevel,
    isExpired,
    metadata,
  };
}

/**
 * Check if agent has valid assurance
 */
export function hasValidAssurance(
  agent: any,
  config: Partial<AssuranceEnforcementConfig> = {}
): boolean {
  const result = checkAssuranceRequirements(
    agent,
    config.defaultMinimum || "L0",
    config
  );
  return result.allowed;
}

/**
 * Get assurance level for an agent
 */
export function getAgentAssuranceLevel(agent: any): AssuranceLevel | null {
  if (!agent || !agent.assurance_level) {
    return null;
  }

  const level = agent.assurance_level;
  const metadata = getAssuranceLevelMetadata(level);

  if (!metadata) {
    return null;
  }

  return level;
}

/**
 * Check if assurance is expired
 */
export function isAgentAssuranceExpired(agent: any): boolean {
  if (!agent) {
    return true;
  }

  return isAssuranceExpired(agent);
}

/**
 * Validate assurance configuration
 */
export function validateAssuranceConfig(assurance: any): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!assurance) {
    errors.push("Assurance configuration is required");
    return { valid: false, errors };
  }

  if (!assurance.level) {
    errors.push("Assurance level is required");
  } else {
    const metadata = getAssuranceLevelMetadata(assurance.level);
    if (!metadata) {
      errors.push(`Invalid assurance level: ${assurance.level}`);
    }
  }

  if (
    assurance.verified_at &&
    isNaN(new Date(assurance.verified_at).getTime())
  ) {
    errors.push("Invalid assurance verification date");
  }

  if (assurance.method && typeof assurance.method !== "string") {
    errors.push("Assurance method must be a string");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get assurance metadata for an agent
 */
export function getAgentAssuranceMetadata(agent: any): any {
  if (!agent || !agent.assurance_level) {
    return {};
  }

  return getAssuranceLevelMetadata(agent.assurance_level);
}
