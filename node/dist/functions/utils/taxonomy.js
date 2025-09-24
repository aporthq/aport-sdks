"use strict";
/**
 * Controlled Taxonomy System
 *
 * This module provides controlled enums for categories and frameworks
 * with validation, display metadata, and performance optimizations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.taxonomyValidator = exports.FRAMEWORK_METADATA = exports.CATEGORY_METADATA = void 0;
exports.validateCategory = validateCategory;
exports.validateFramework = validateFramework;
exports.validateCategories = validateCategories;
exports.validateFrameworks = validateFrameworks;
exports.getCategoryMetadata = getCategoryMetadata;
exports.getFrameworkMetadata = getFrameworkMetadata;
exports.getCategoriesSorted = getCategoriesSorted;
exports.getFrameworksSorted = getFrameworksSorted;
exports.getCategoriesByCapability = getCategoriesByCapability;
exports.getFrameworksByCapability = getFrameworksByCapability;
exports.getDisplayData = getDisplayData;
exports.generateBadgeData = generateBadgeData;
/**
 * Complete registry of valid categories with metadata
 */
exports.CATEGORY_METADATA = {
    support: {
        id: "support",
        name: "Support",
        description: "Customer support and helpdesk automation",
        color: "#3B82F6", // Blue
        icon: "headset",
        order: 1,
        capabilities: ["messaging.send", "crm.update", "data.export"],
    },
    commerce: {
        id: "commerce",
        name: "Commerce",
        description: "E-commerce and payment processing",
        color: "#10B981", // Green
        icon: "shopping-cart",
        order: 2,
        capabilities: [
            "payments.refund",
            "payments.payout",
            "inventory.adjust",
            "returns.process",
        ],
    },
    devops: {
        id: "devops",
        name: "DevOps",
        description: "Development operations and deployment",
        color: "#F59E0B", // Amber
        icon: "server",
        order: 3,
        capabilities: ["infra.deploy", "repo.merge"],
    },
    ops: {
        id: "ops",
        name: "Operations",
        description: "Business operations and workflow automation",
        color: "#8B5CF6", // Purple
        icon: "cog",
        order: 4,
        capabilities: ["data.export", "data.delete", "identity.manage_roles"],
    },
    analytics: {
        id: "analytics",
        name: "Analytics",
        description: "Data analysis and reporting",
        color: "#EF4444", // Red
        icon: "chart-bar",
        order: 5,
        capabilities: ["data.export", "data.delete"],
    },
    marketing: {
        id: "marketing",
        name: "Marketing",
        description: "Marketing automation and campaigns",
        color: "#EC4899", // Pink
        icon: "megaphone",
        order: 6,
        capabilities: ["messaging.send", "crm.update", "data.export"],
    },
};
/**
 * Complete registry of valid frameworks with metadata
 */
exports.FRAMEWORK_METADATA = {
    n8n: {
        id: "n8n",
        name: "n8n",
        description: "Workflow automation platform",
        color: "#FF6D5A", // Orange-red
        icon: "workflow",
        website: "https://n8n.io",
        order: 1,
        capabilities: ["*"], // n8n can handle any capability
    },
    LangGraph: {
        id: "LangGraph",
        name: "LangGraph",
        description: "Stateful applications with LLMs",
        color: "#00D4AA", // Teal
        icon: "graph",
        website: "https://langchain-ai.github.io/langgraph/",
        order: 2,
        capabilities: ["*"], // LangGraph is general purpose
    },
    CrewAI: {
        id: "CrewAI",
        name: "CrewAI",
        description: "Multi-agent collaboration framework",
        color: "#6366F1", // Indigo
        icon: "users",
        website: "https://crewai.com",
        order: 3,
        capabilities: ["*"], // CrewAI is general purpose
    },
    AutoGen: {
        id: "AutoGen",
        name: "AutoGen",
        description: "Multi-agent conversation framework",
        color: "#8B5CF6", // Purple
        icon: "chat-bubble",
        website: "https://microsoft.github.io/autogen/",
        order: 4,
        capabilities: ["*"], // AutoGen is general purpose
    },
    OpenAI: {
        id: "OpenAI",
        name: "OpenAI",
        description: "OpenAI API and models",
        color: "#00A67E", // Dark teal
        icon: "openai",
        website: "https://openai.com",
        order: 5,
        capabilities: ["*"], // OpenAI is general purpose
    },
    LlamaIndex: {
        id: "LlamaIndex",
        name: "LlamaIndex",
        description: "Data framework for LLM applications",
        color: "#FF6B35", // Orange
        icon: "database",
        website: "https://llamaindex.ai",
        order: 6,
        capabilities: ["data.export", "data.delete", "analytics"],
    },
    Custom: {
        id: "Custom",
        name: "Custom",
        description: "Custom or proprietary framework",
        color: "#6B7280", // Gray
        icon: "code",
        order: 7,
        capabilities: ["*"], // Custom can be anything
    },
};
/**
 * Validate a single category
 */
function validateCategory(category) {
    const errors = [];
    const warnings = [];
    if (!Object.keys(exports.CATEGORY_METADATA).includes(category)) {
        errors.push(`Invalid category: ${category}. Valid categories: ${Object.keys(exports.CATEGORY_METADATA).join(", ")}`);
    }
    return { valid: errors.length === 0, errors, warnings };
}
/**
 * Validate a single framework
 */
function validateFramework(framework) {
    const errors = [];
    const warnings = [];
    if (!Object.keys(exports.FRAMEWORK_METADATA).includes(framework)) {
        errors.push(`Invalid framework: ${framework}. Valid frameworks: ${Object.keys(exports.FRAMEWORK_METADATA).join(", ")}`);
    }
    return { valid: errors.length === 0, errors, warnings };
}
/**
 * Validate categories array
 */
function validateCategories(categories) {
    const errors = [];
    const warnings = [];
    for (const category of categories) {
        const result = validateCategory(category);
        errors.push(...result.errors);
        warnings.push(...result.warnings);
    }
    return { valid: errors.length === 0, errors, warnings };
}
/**
 * Validate frameworks array
 */
function validateFrameworks(frameworks) {
    const errors = [];
    const warnings = [];
    for (const framework of frameworks) {
        const result = validateFramework(framework);
        errors.push(...result.errors);
        warnings.push(...result.warnings);
    }
    return { valid: errors.length === 0, errors, warnings };
}
/**
 * Get category metadata by ID
 */
function getCategoryMetadata(category) {
    return exports.CATEGORY_METADATA[category];
}
/**
 * Get framework metadata by ID
 */
function getFrameworkMetadata(framework) {
    return exports.FRAMEWORK_METADATA[framework];
}
/**
 * Get all categories sorted by display order
 */
function getCategoriesSorted() {
    return Object.values(exports.CATEGORY_METADATA)
        .sort((a, b) => a.order - b.order)
        .map((cat) => cat.id);
}
/**
 * Get all frameworks sorted by display order
 */
function getFrameworksSorted() {
    return Object.values(exports.FRAMEWORK_METADATA)
        .sort((a, b) => a.order - b.order)
        .map((fw) => fw.id);
}
/**
 * Get categories by capability
 */
function getCategoriesByCapability(capabilityId) {
    return Object.values(exports.CATEGORY_METADATA)
        .filter((cat) => cat.capabilities.includes("*") ||
        cat.capabilities.includes(capabilityId))
        .sort((a, b) => a.order - b.order)
        .map((cat) => cat.id);
}
/**
 * Get frameworks by capability
 */
function getFrameworksByCapability(capabilityId) {
    return Object.values(exports.FRAMEWORK_METADATA)
        .filter((fw) => fw.capabilities.includes("*") || fw.capabilities.includes(capabilityId))
        .sort((a, b) => a.order - b.order)
        .map((fw) => fw.id);
}
/**
 * OPTIMIZED: Fast validation for edge performance
 * Pre-validates common values and caches results
 */
class TaxonomyValidator {
    constructor() {
        this.categoryCache = new Map();
        this.frameworkCache = new Map();
    }
    /**
     * Fast category validation with caching
     */
    isValidCategory(category) {
        if (this.categoryCache.has(category)) {
            return this.categoryCache.get(category);
        }
        const valid = Object.keys(exports.CATEGORY_METADATA).includes(category);
        this.categoryCache.set(category, valid);
        return valid;
    }
    /**
     * Fast framework validation with caching
     */
    isValidFramework(framework) {
        if (this.frameworkCache.has(framework)) {
            return this.frameworkCache.get(framework);
        }
        const valid = Object.keys(exports.FRAMEWORK_METADATA).includes(framework);
        this.frameworkCache.set(framework, valid);
        return valid;
    }
    /**
     * Validate categories array with fast path
     */
    validateCategoriesFast(categories) {
        const invalid = [];
        for (const category of categories) {
            if (!this.isValidCategory(category)) {
                invalid.push(category);
            }
        }
        return { valid: invalid.length === 0, invalid };
    }
    /**
     * Validate frameworks array with fast path
     */
    validateFrameworksFast(frameworks) {
        const invalid = [];
        for (const framework of frameworks) {
            if (!this.isValidFramework(framework)) {
                invalid.push(framework);
            }
        }
        return { valid: invalid.length === 0, invalid };
    }
    /**
     * Clear caches (useful for testing)
     */
    clearCache() {
        this.categoryCache.clear();
        this.frameworkCache.clear();
    }
}
/**
 * Global validator instance for performance
 */
exports.taxonomyValidator = new TaxonomyValidator();
/**
 * Get display data for UI components
 */
function getDisplayData() {
    return {
        categories: getCategoriesSorted().map((id) => exports.CATEGORY_METADATA[id]),
        frameworks: getFrameworksSorted().map((id) => exports.FRAMEWORK_METADATA[id]),
    };
}
/**
 * Generate badge data for AgentCard display
 */
function generateBadgeData(categories, frameworks) {
    return {
        categories: categories.map((cat) => ({
            ...exports.CATEGORY_METADATA[cat],
        })),
        frameworks: frameworks.map((fw) => ({
            ...exports.FRAMEWORK_METADATA[fw],
        })),
    };
}
//# sourceMappingURL=taxonomy.js.map