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
export declare const DEFAULT_CAPABILITY_CONFIG: CapabilityEnforcementConfig;
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
export declare function checkCapabilities(agent: any, requiredCapabilities: string[], config?: Partial<CapabilityEnforcementConfig>): CapabilityEnforcementResult;
/**
 * Check if agent has specific capability
 */
export declare function hasCapability(agent: any, capability: string): boolean;
/**
 * Get all capabilities for an agent
 */
export declare function getAgentCapabilities(agent: any): string[];
/**
 * Check if agent has any of the specified capabilities
 */
export declare function hasAnyCapability(agent: any, capabilities: string[]): boolean;
/**
 * Check if agent has all of the specified capabilities
 */
export declare function hasAllCapabilities(agent: any, capabilities: string[]): boolean;
/**
 * Create a capability enforcer function
 */
export declare function createCapabilityEnforcer(config?: Partial<CapabilityEnforcementConfig>): (path: string, agentCapabilities: string[]) => CapabilityEnforcementResult;
/**
 * Validate capability configuration
 */
export declare function validateCapabilityConfig(config: any): {
    valid: boolean;
    errors: string[];
};
//# sourceMappingURL=capability-enforcement.d.ts.map