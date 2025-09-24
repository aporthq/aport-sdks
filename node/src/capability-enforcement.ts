/**
 * Capability Enforcement Module
 *
 * This module provides capability-based access control for Agent Passport.
 * It allows checking if agents have specific capabilities required for operations.
 */

export interface CapabilityEnforcementConfig {
  enabled: boolean;
  enforceOnAllRoutes: boolean;
  requiredCapabilities?: string[];
  allowedCapabilities?: string[];
  strictMode: boolean;
  logViolations: boolean;
  skipRoutes?: string[];
  allowUnmappedRoutes?: boolean;
}

export const DEFAULT_CAPABILITY_CONFIG: CapabilityEnforcementConfig = {
  enabled: true,
  enforceOnAllRoutes: false,
  requiredCapabilities: [],
  allowedCapabilities: [],
  strictMode: true,
  logViolations: true,
  skipRoutes: [],
  allowUnmappedRoutes: false,
};

export interface CapabilityEnforcementResult {
  allowed: boolean;
  violations: string[];
  missing: string[];
  extra: string[];
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Check if agent has required capabilities
 */
export function checkCapabilities(
  agent: any,
  requiredCapabilities: string[],
  config: Partial<CapabilityEnforcementConfig> = {}
): CapabilityEnforcementResult {
  const finalConfig = { ...DEFAULT_CAPABILITY_CONFIG, ...config };

  if (!finalConfig.enabled) {
    return {
      allowed: true,
      violations: [],
      missing: [],
      extra: [],
    };
  }

  if (!agent || !agent.capabilities) {
    return {
      allowed: false,
      violations: ["no_capabilities: Agent has no capabilities defined"],
      missing: requiredCapabilities,
      extra: [],
      error: {
        code: "no_capabilities",
        message: "Agent has no capabilities defined",
      },
    };
  }

  const agentCapabilities = agent.capabilities.map((cap: any) => cap.id || cap);
  const missing = requiredCapabilities.filter(
    (cap) => !agentCapabilities.includes(cap)
  );
  const extra = agentCapabilities.filter(
    (cap: string) => !requiredCapabilities.includes(cap)
  );

  const violations: string[] = [];

  if (missing.length > 0) {
    violations.push(`missing_capabilities: ${missing.join(", ")}`);
  }

  if (finalConfig.strictMode && extra.length > 0) {
    violations.push(`extra_capabilities: ${extra.join(", ")}`);
  }

  const allowed = violations.length === 0;

  if (finalConfig.logViolations && !allowed) {
    console.warn(`Capability enforcement failed for agent ${agent.agent_id}:`, {
      missing,
      extra,
      violations,
    });
  }

  return {
    allowed,
    violations,
    missing,
    extra,
    error: allowed
      ? undefined
      : {
          code: "insufficient_capabilities",
          message: `Missing required capabilities: ${missing.join(", ")}`,
        },
  };
}

/**
 * Check if agent has specific capability
 */
export function hasCapability(agent: any, capability: string): boolean {
  if (!agent || !agent.capabilities) {
    return false;
  }

  return agent.capabilities.some((cap: any) => (cap.id || cap) === capability);
}

/**
 * Get all capabilities for an agent
 */
export function getAgentCapabilities(agent: any): string[] {
  if (!agent || !agent.capabilities) {
    return [];
  }

  return agent.capabilities.map((cap: any) => cap.id || cap);
}

/**
 * Check if agent has any of the specified capabilities
 */
export function hasAnyCapability(agent: any, capabilities: string[]): boolean {
  if (!agent || !agent.capabilities) {
    return false;
  }

  const agentCapabilities = getAgentCapabilities(agent);
  return capabilities.some((cap) => agentCapabilities.includes(cap));
}

/**
 * Check if agent has all of the specified capabilities
 */
export function hasAllCapabilities(
  agent: any,
  capabilities: string[]
): boolean {
  if (!agent || !agent.capabilities) {
    return false;
  }

  const agentCapabilities = getAgentCapabilities(agent);
  return capabilities.every((cap) => agentCapabilities.includes(cap));
}

/**
 * Create a capability enforcer function
 */
export function createCapabilityEnforcer(
  config: Partial<CapabilityEnforcementConfig> = {}
) {
  return (
    path: string,
    agentCapabilities: string[]
  ): CapabilityEnforcementResult => {
    const finalConfig = { ...DEFAULT_CAPABILITY_CONFIG, ...config };

    if (!finalConfig.enabled) {
      return {
        allowed: true,
        violations: [],
        missing: [],
        extra: [],
      };
    }

    const requiredCapabilities = finalConfig.requiredCapabilities || [];

    if (requiredCapabilities.length === 0) {
      return {
        allowed: true,
        violations: [],
        missing: [],
        extra: [],
      };
    }

    const missing = requiredCapabilities.filter(
      (cap) => !agentCapabilities.includes(cap)
    );
    const extra = agentCapabilities.filter(
      (cap: string) => !requiredCapabilities.includes(cap)
    );

    const violations: string[] = [];

    if (missing.length > 0) {
      violations.push(`missing_capabilities: ${missing.join(", ")}`);
    }

    if (finalConfig.strictMode && extra.length > 0) {
      violations.push(`extra_capabilities: ${extra.join(", ")}`);
    }

    const allowed = violations.length === 0;

    if (finalConfig.logViolations && !allowed) {
      console.warn(`Capability enforcement failed for path ${path}:`, {
        missing,
        extra,
        violations,
      });
    }

    return {
      allowed,
      violations,
      missing,
      extra,
      error: allowed
        ? undefined
        : {
            code: "insufficient_capabilities",
            message: `Missing required capabilities: ${missing.join(", ")}`,
          },
    };
  };
}

/**
 * Validate capability configuration
 */
export function validateCapabilityConfig(config: any): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (typeof config.enabled !== "boolean") {
    errors.push("enabled must be a boolean");
  }

  if (typeof config.enforceOnAllRoutes !== "boolean") {
    errors.push("enforceOnAllRoutes must be a boolean");
  }

  if (
    config.requiredCapabilities &&
    !Array.isArray(config.requiredCapabilities)
  ) {
    errors.push("requiredCapabilities must be an array");
  }

  if (
    config.allowedCapabilities &&
    !Array.isArray(config.allowedCapabilities)
  ) {
    errors.push("allowedCapabilities must be an array");
  }

  if (typeof config.strictMode !== "boolean") {
    errors.push("strictMode must be a boolean");
  }

  if (typeof config.logViolations !== "boolean") {
    errors.push("logViolations must be a boolean");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
