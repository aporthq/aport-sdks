"use strict";
/**
 * Assurance Enforcement SDK for Agent Passport
 *
 * Provides minimum assurance level enforcement with performance optimizations
 * for edge computing environments.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ASSURANCE_CONFIG = void 0;
exports.checkAssuranceRequirements = checkAssuranceRequirements;
exports.hasValidAssurance = hasValidAssurance;
exports.getAgentAssuranceLevel = getAgentAssuranceLevel;
exports.isAgentAssuranceExpired = isAgentAssuranceExpired;
exports.validateAssuranceConfig = validateAssuranceConfig;
exports.getAgentAssuranceMetadata = getAgentAssuranceMetadata;
const assurance_1 = require("../../../functions/utils/assurance");
/**
 * Default assurance enforcement configuration
 */
exports.DEFAULT_ASSURANCE_CONFIG = {
    enabled: true,
    strictMode: true,
    logViolations: true,
    defaultMinimum: "L0",
    routeRequirements: {},
};
/**
 * Check if agent meets minimum assurance requirements
 */
function checkAssuranceRequirements(agent, requiredLevel, config = {}) {
    const finalConfig = { ...exports.DEFAULT_ASSURANCE_CONFIG, ...config };
    if (!finalConfig.enabled) {
        return {
            allowed: true,
            violations: [],
            assuranceLevel: null,
            isExpired: false,
            metadata: {},
        };
    }
    const violations = [];
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
    const metadata = (0, assurance_1.getAssuranceLevelMetadata)(agentLevel);
    const isExpired = (0, assurance_1.isAssuranceExpired)(agent);
    if (isExpired) {
        violations.push({
            type: "assurance_expired",
            reason: "Agent assurance has expired",
            actual: agentLevel,
        });
    }
    if (!(0, assurance_1.meetsMinimumAssurance)(agentLevel, requiredLevel)) {
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
function hasValidAssurance(agent, config = {}) {
    const result = checkAssuranceRequirements(agent, config.defaultMinimum || "L0", config);
    return result.allowed;
}
/**
 * Get assurance level for an agent
 */
function getAgentAssuranceLevel(agent) {
    if (!agent || !agent.assurance_level) {
        return null;
    }
    const level = agent.assurance_level;
    const metadata = (0, assurance_1.getAssuranceLevelMetadata)(level);
    if (!metadata) {
        return null;
    }
    return level;
}
/**
 * Check if assurance is expired
 */
function isAgentAssuranceExpired(agent) {
    if (!agent) {
        return true;
    }
    return (0, assurance_1.isAssuranceExpired)(agent);
}
/**
 * Validate assurance configuration
 */
function validateAssuranceConfig(assurance) {
    const errors = [];
    if (!assurance) {
        errors.push("Assurance configuration is required");
        return { valid: false, errors };
    }
    if (!assurance.level) {
        errors.push("Assurance level is required");
    }
    else {
        const metadata = (0, assurance_1.getAssuranceLevelMetadata)(assurance.level);
        if (!metadata) {
            errors.push(`Invalid assurance level: ${assurance.level}`);
        }
    }
    if (assurance.verified_at &&
        isNaN(new Date(assurance.verified_at).getTime())) {
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
function getAgentAssuranceMetadata(agent) {
    if (!agent || !agent.assurance_level) {
        return {};
    }
    return (0, assurance_1.getAssuranceLevelMetadata)(agent.assurance_level);
}
//# sourceMappingURL=assurance-enforcement.js.map