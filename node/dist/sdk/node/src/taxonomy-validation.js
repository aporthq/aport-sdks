"use strict";
/**
 * Taxonomy Validation SDK for Agent Passport
 *
 * Provides framework-agnostic taxonomy validation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAgentTaxonomy = validateAgentTaxonomy;
exports.hasRequiredCategories = hasRequiredCategories;
exports.hasRequiredFrameworks = hasRequiredFrameworks;
exports.validateTaxonomyForAgent = validateTaxonomyForAgent;
exports.getAgentCategories = getAgentCategories;
exports.getAgentFrameworks = getAgentFrameworks;
const taxonomy_1 = require("../../../functions/utils/taxonomy");
/**
 * Default taxonomy validation configuration
 */
const DEFAULT_CONFIG = {
    enabled: true,
    strictMode: true,
    logViolations: true,
};
/**
 * Validate agent taxonomy
 */
function validateAgentTaxonomy(agent) {
    if (!agent || !agent.capabilities) {
        return {
            valid: false,
            categories: [],
            frameworks: [],
            errors: ["No capabilities configured"],
        };
    }
    const capabilities = agent.capabilities.map((cap) => cap.id || cap);
    const categories = (0, taxonomy_1.getCategoriesByCapability)(capabilities);
    const frameworks = (0, taxonomy_1.getFrameworksByCapability)(capabilities);
    const categoryValidation = (0, taxonomy_1.validateCategories)(categories);
    const frameworkValidation = (0, taxonomy_1.validateFrameworks)(frameworks);
    const errors = [];
    if (!categoryValidation.valid) {
        errors.push(...(categoryValidation.errors || []));
    }
    if (!frameworkValidation.valid) {
        errors.push(...(frameworkValidation.errors || []));
    }
    return {
        valid: categoryValidation.valid && frameworkValidation.valid,
        categories,
        frameworks,
        errors,
    };
}
/**
 * Check if agent has required categories
 */
function hasRequiredCategories(agent, requiredCategories, config = {}) {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    if (!finalConfig.enabled) {
        return {
            allowed: true,
            violations: [],
            categories: [],
            frameworks: [],
        };
    }
    const violations = [];
    if (!agent || !agent.capabilities) {
        violations.push({
            type: "no_capabilities",
            reason: "No capabilities configured for this agent",
        });
        return {
            allowed: !finalConfig.strictMode,
            violations,
            categories: [],
            frameworks: [],
        };
    }
    const capabilities = agent.capabilities.map((cap) => cap.id || cap);
    const agentCategories = (0, taxonomy_1.getCategoriesByCapability)(capabilities);
    for (const requiredCategory of requiredCategories) {
        if (!agentCategories.includes(requiredCategory)) {
            violations.push({
                type: "missing_category",
                reason: `Required category ${requiredCategory} not found`,
                category: requiredCategory,
            });
        }
    }
    return {
        allowed: violations.length === 0,
        violations,
        categories: agentCategories,
        frameworks: [],
    };
}
/**
 * Check if agent has required frameworks
 */
function hasRequiredFrameworks(agent, requiredFrameworks, config = {}) {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    if (!finalConfig.enabled) {
        return {
            allowed: true,
            violations: [],
            categories: [],
            frameworks: [],
        };
    }
    const violations = [];
    if (!agent || !agent.capabilities) {
        violations.push({
            type: "no_capabilities",
            reason: "No capabilities configured for this agent",
        });
        return {
            allowed: !finalConfig.strictMode,
            violations,
            categories: [],
            frameworks: [],
        };
    }
    const capabilities = agent.capabilities.map((cap) => cap.id || cap);
    const agentFrameworks = (0, taxonomy_1.getFrameworksByCapability)(capabilities);
    for (const requiredFramework of requiredFrameworks) {
        if (!agentFrameworks.includes(requiredFramework)) {
            violations.push({
                type: "missing_framework",
                reason: `Required framework ${requiredFramework} not found`,
                framework: requiredFramework,
            });
        }
    }
    return {
        allowed: violations.length === 0,
        violations,
        categories: [],
        frameworks: agentFrameworks,
    };
}
/**
 * Validate taxonomy for an agent
 */
function validateTaxonomyForAgent(agent, config = {}) {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    if (!finalConfig.enabled) {
        return {
            allowed: true,
            violations: [],
            categories: [],
            frameworks: [],
        };
    }
    const violations = [];
    if (!agent || !agent.capabilities) {
        violations.push({
            type: "no_capabilities",
            reason: "No capabilities configured for this agent",
        });
        return {
            allowed: !finalConfig.strictMode,
            violations,
            categories: [],
            frameworks: [],
        };
    }
    const capabilities = agent.capabilities.map((cap) => cap.id || cap);
    const categories = (0, taxonomy_1.getCategoriesByCapability)(capabilities);
    const frameworks = (0, taxonomy_1.getFrameworksByCapability)(capabilities);
    // Validate categories
    const categoryValidation = (0, taxonomy_1.validateCategories)(categories);
    if (!categoryValidation.valid) {
        violations.push({
            type: "invalid_categories",
            reason: `Invalid categories: ${categoryValidation.errors?.join(", ")}`,
        });
    }
    // Validate frameworks
    const frameworkValidation = (0, taxonomy_1.validateFrameworks)(frameworks);
    if (!frameworkValidation.valid) {
        violations.push({
            type: "invalid_frameworks",
            reason: `Invalid frameworks: ${frameworkValidation.errors?.join(", ")}`,
        });
    }
    // Check required categories
    if (finalConfig.requireCategories) {
        for (const requiredCategory of finalConfig.requireCategories) {
            if (!categories.includes(requiredCategory)) {
                violations.push({
                    type: "missing_required_category",
                    reason: `Required category ${requiredCategory} not found`,
                    category: requiredCategory,
                });
            }
        }
    }
    // Check required frameworks
    if (finalConfig.requireFrameworks) {
        for (const requiredFramework of finalConfig.requireFrameworks) {
            if (!frameworks.includes(requiredFramework)) {
                violations.push({
                    type: "missing_required_framework",
                    reason: `Required framework ${requiredFramework} not found`,
                    framework: requiredFramework,
                });
            }
        }
    }
    return {
        allowed: violations.length === 0,
        violations,
        categories,
        frameworks,
    };
}
/**
 * Get categories for an agent
 */
function getAgentCategories(agent) {
    if (!agent || !agent.capabilities) {
        return [];
    }
    const capabilities = agent.capabilities.map((cap) => cap.id || cap);
    return (0, taxonomy_1.getCategoriesByCapability)(capabilities);
}
/**
 * Get frameworks for an agent
 */
function getAgentFrameworks(agent) {
    if (!agent || !agent.capabilities) {
        return [];
    }
    const capabilities = agent.capabilities.map((cap) => cap.id || cap);
    return (0, taxonomy_1.getFrameworksByCapability)(capabilities);
}
//# sourceMappingURL=taxonomy-validation.js.map