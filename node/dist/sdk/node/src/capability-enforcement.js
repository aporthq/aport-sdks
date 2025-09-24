"use strict";
/**
 * Capability Enforcement Module
 *
 * This module provides capability-based access control for Agent Passport.
 * It allows checking if agents have specific capabilities required for operations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CAPABILITY_CONFIG = void 0;
exports.checkCapabilities = checkCapabilities;
exports.hasCapability = hasCapability;
exports.getAgentCapabilities = getAgentCapabilities;
exports.hasAnyCapability = hasAnyCapability;
exports.hasAllCapabilities = hasAllCapabilities;
exports.createCapabilityEnforcer = createCapabilityEnforcer;
exports.validateCapabilityConfig = validateCapabilityConfig;
exports.DEFAULT_CAPABILITY_CONFIG = {
    enabled: true,
    enforceOnAllRoutes: false,
    requiredCapabilities: [],
    allowedCapabilities: [],
    strictMode: true,
    logViolations: true,
    skipRoutes: [],
    allowUnmappedRoutes: false,
};
/**
 * Check if agent has required capabilities
 */
function checkCapabilities(agent, requiredCapabilities, config = {}) {
    const finalConfig = { ...exports.DEFAULT_CAPABILITY_CONFIG, ...config };
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
    const agentCapabilities = agent.capabilities.map((cap) => cap.id || cap);
    const missing = requiredCapabilities.filter((cap) => !agentCapabilities.includes(cap));
    const extra = agentCapabilities.filter((cap) => !requiredCapabilities.includes(cap));
    const violations = [];
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
function hasCapability(agent, capability) {
    if (!agent || !agent.capabilities) {
        return false;
    }
    return agent.capabilities.some((cap) => (cap.id || cap) === capability);
}
/**
 * Get all capabilities for an agent
 */
function getAgentCapabilities(agent) {
    if (!agent || !agent.capabilities) {
        return [];
    }
    return agent.capabilities.map((cap) => cap.id || cap);
}
/**
 * Check if agent has any of the specified capabilities
 */
function hasAnyCapability(agent, capabilities) {
    if (!agent || !agent.capabilities) {
        return false;
    }
    const agentCapabilities = getAgentCapabilities(agent);
    return capabilities.some((cap) => agentCapabilities.includes(cap));
}
/**
 * Check if agent has all of the specified capabilities
 */
function hasAllCapabilities(agent, capabilities) {
    if (!agent || !agent.capabilities) {
        return false;
    }
    const agentCapabilities = getAgentCapabilities(agent);
    return capabilities.every((cap) => agentCapabilities.includes(cap));
}
/**
 * Create a capability enforcer function
 */
function createCapabilityEnforcer(config = {}) {
    return (path, agentCapabilities) => {
        const finalConfig = { ...exports.DEFAULT_CAPABILITY_CONFIG, ...config };
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
        const missing = requiredCapabilities.filter((cap) => !agentCapabilities.includes(cap));
        const extra = agentCapabilities.filter((cap) => !requiredCapabilities.includes(cap));
        const violations = [];
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
function validateCapabilityConfig(config) {
    const errors = [];
    if (typeof config.enabled !== "boolean") {
        errors.push("enabled must be a boolean");
    }
    if (typeof config.enforceOnAllRoutes !== "boolean") {
        errors.push("enforceOnAllRoutes must be a boolean");
    }
    if (config.requiredCapabilities &&
        !Array.isArray(config.requiredCapabilities)) {
        errors.push("requiredCapabilities must be an array");
    }
    if (config.allowedCapabilities &&
        !Array.isArray(config.allowedCapabilities)) {
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
//# sourceMappingURL=capability-enforcement.js.map