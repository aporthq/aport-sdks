"use strict";
/**
 * Assurance Levels System
 *
 * This module provides assurance level computation, validation, and enforcement
 * with performance optimizations for edge computing environments.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.assuranceValidator = exports.ASSURANCE_LEVEL_METADATA = void 0;
exports.computeAssuranceLevel = computeAssuranceLevel;
exports.getAssuranceLevelMetadata = getAssuranceLevelMetadata;
exports.getAssuranceLevelsSorted = getAssuranceLevelsSorted;
exports.compareAssuranceLevels = compareAssuranceLevels;
exports.meetsMinimumAssurance = meetsMinimumAssurance;
exports.getAssuranceLevelForMethod = getAssuranceLevelForMethod;
exports.validateAssuranceLevel = validateAssuranceLevel;
exports.validateAssuranceMethod = validateAssuranceMethod;
exports.createOwnerAssurance = createOwnerAssurance;
exports.updateOwnerAssurance = updateOwnerAssurance;
exports.isAssuranceExpired = isAssuranceExpired;
exports.getAssuranceDisplayData = getAssuranceDisplayData;
exports.getAssuranceRequirements = getAssuranceRequirements;
exports.getAssuranceRiskLevel = getAssuranceRiskLevel;
exports.generateAssuranceBadgeData = generateAssuranceBadgeData;
/**
 * Complete registry of assurance levels with metadata
 */
exports.ASSURANCE_LEVEL_METADATA = {
    L0: {
        level: "L0",
        name: "Self-Attested",
        description: "Owner self-declares identity without verification",
        requirements: ["Self-declaration"],
        verificationMethods: ["self_attested"],
        riskLevel: "very_high",
        order: 0,
        color: "#EF4444", // Red
        icon: "warning",
    },
    L1: {
        level: "L1",
        name: "Email Verified",
        description: "Email address verified through confirmation link",
        requirements: ["Valid email address", "Email confirmation"],
        verificationMethods: ["email_verified"],
        riskLevel: "high",
        order: 1,
        color: "#F59E0B", // Amber
        icon: "mail",
    },
    L2: {
        level: "L2",
        name: "GitHub Verified",
        description: "GitHub account verified and linked",
        requirements: ["GitHub account", "Public profile", "Repository access"],
        verificationMethods: ["github_verified"],
        riskLevel: "medium",
        order: 2,
        color: "#3B82F6", // Blue
        icon: "github",
    },
    L3: {
        level: "L3",
        name: "Domain Verified",
        description: "Domain ownership verified via DNS TXT or /.well-known/agent-owner.json",
        requirements: [
            "Domain ownership",
            "DNS TXT record or /.well-known/agent-owner.json",
        ],
        verificationMethods: ["domain_verified"],
        riskLevel: "low",
        order: 3,
        color: "#10B981", // Green
        icon: "globe",
    },
    L4KYC: {
        level: "L4KYC",
        name: "KYC/KYB Verified",
        description: "Know Your Customer/Business verification completed",
        requirements: [
            "Government ID",
            "Address verification",
            "Business registration",
        ],
        verificationMethods: ["kyc_verified", "kyb_verified"],
        riskLevel: "low",
        order: 4,
        color: "#8B5CF6", // Purple
        icon: "shield-check",
    },
    L4FIN: {
        level: "L4FIN",
        name: "Financial Data Verified",
        description: "Financial data and banking information verified",
        requirements: [
            "Bank account verification",
            "Financial statements",
            "Tax records",
        ],
        verificationMethods: ["financial_data_verified"],
        riskLevel: "low",
        order: 5,
        color: "#059669", // Emerald
        icon: "bank",
    },
};
/**
 * Compute assurance level from verification methods
 */
function computeAssuranceLevel(verificationMethods) {
    // Sort by assurance level order (highest first)
    const sortedMethods = verificationMethods
        .map((method) => {
        const level = Object.values(exports.ASSURANCE_LEVEL_METADATA).find((meta) => meta.verificationMethods.includes(method));
        return { method, order: level?.order ?? -1 };
    })
        .sort((a, b) => b.order - a.order);
    if (sortedMethods.length === 0) {
        return "L0"; // Default to self-attested
    }
    // Return the highest level achieved
    const highestMethod = sortedMethods[0];
    const level = Object.values(exports.ASSURANCE_LEVEL_METADATA).find((meta) => meta.verificationMethods.includes(highestMethod.method));
    return level?.level ?? "L0";
}
/**
 * Get assurance level metadata
 */
function getAssuranceLevelMetadata(level) {
    return exports.ASSURANCE_LEVEL_METADATA[level];
}
/**
 * Get all assurance levels sorted by order
 */
function getAssuranceLevelsSorted() {
    return Object.values(exports.ASSURANCE_LEVEL_METADATA)
        .sort((a, b) => a.order - b.order)
        .map((meta) => meta.level);
}
/**
 * Compare assurance levels (returns -1, 0, or 1)
 */
function compareAssuranceLevels(level1, level2) {
    const meta1 = exports.ASSURANCE_LEVEL_METADATA[level1];
    const meta2 = exports.ASSURANCE_LEVEL_METADATA[level2];
    if (!meta1 || !meta2)
        return 0;
    return meta1.order - meta2.order;
}
/**
 * Check if assurance level meets minimum requirement
 */
function meetsMinimumAssurance(actualLevel, minimumLevel) {
    return compareAssuranceLevels(actualLevel, minimumLevel) >= 0;
}
/**
 * Get assurance level for specific verification method
 */
function getAssuranceLevelForMethod(method) {
    const level = Object.values(exports.ASSURANCE_LEVEL_METADATA).find((meta) => meta.verificationMethods.includes(method));
    return level?.level;
}
/**
 * Validate assurance level
 */
function validateAssuranceLevel(level) {
    if (!Object.keys(exports.ASSURANCE_LEVEL_METADATA).includes(level)) {
        return {
            valid: false,
            error: `Invalid assurance level: ${level}. Valid levels: ${Object.keys(exports.ASSURANCE_LEVEL_METADATA).join(", ")}`,
        };
    }
    return { valid: true, level: level };
}
/**
 * Validate assurance method
 */
function validateAssuranceMethod(method) {
    const validMethods = Object.values(exports.ASSURANCE_LEVEL_METADATA).flatMap((meta) => meta.verificationMethods);
    if (!validMethods.includes(method)) {
        return {
            valid: false,
            error: `Invalid assurance method: ${method}. Valid methods: ${validMethods.join(", ")}`,
        };
    }
    return { valid: true, method: method };
}
/**
 * Create owner assurance record
 */
function createOwnerAssurance(verificationMethods, evidence, expiresAt) {
    const level = computeAssuranceLevel(verificationMethods);
    const method = verificationMethods[0] || "self_attested";
    const now = new Date().toISOString();
    return {
        level,
        method,
        verifiedAt: now,
        evidence,
        expiresAt,
        lastUpdated: now,
    };
}
/**
 * Update owner assurance record
 */
function updateOwnerAssurance(current, newVerificationMethods, evidence, expiresAt) {
    const newLevel = computeAssuranceLevel(newVerificationMethods);
    const newMethod = newVerificationMethods[0] || current.method;
    const now = new Date().toISOString();
    // Only update if new level is higher or equal
    if (compareAssuranceLevels(newLevel, current.level) >= 0) {
        return {
            level: newLevel,
            method: newMethod,
            verifiedAt: now,
            evidence: evidence || current.evidence,
            expiresAt: expiresAt || current.expiresAt,
            lastUpdated: now,
        };
    }
    // Return current if new level is lower
    return {
        ...current,
        lastUpdated: now,
    };
}
/**
 * Check if assurance is expired
 */
function isAssuranceExpired(assurance) {
    if (!assurance.expiresAt)
        return false;
    return new Date(assurance.expiresAt) < new Date();
}
/**
 * Get assurance display data for UI
 */
function getAssuranceDisplayData(level) {
    const metadata = exports.ASSURANCE_LEVEL_METADATA[level];
    if (!metadata)
        return null;
    return {
        level: metadata.level,
        name: metadata.name,
        description: metadata.description,
        color: metadata.color,
        icon: metadata.icon,
        riskLevel: metadata.riskLevel,
        requirements: metadata.requirements,
    };
}
/**
 * OPTIMIZED: Fast assurance validation for edge performance
 */
class AssuranceValidator {
    constructor() {
        this.levelCache = new Map();
        this.methodCache = new Map();
    }
    /**
     * Fast assurance level validation with caching
     */
    isValidLevel(level) {
        if (this.levelCache.has(level)) {
            return this.levelCache.get(level);
        }
        const valid = Object.keys(exports.ASSURANCE_LEVEL_METADATA).includes(level);
        this.levelCache.set(level, valid);
        return valid;
    }
    /**
     * Fast assurance method validation with caching
     */
    isValidMethod(method) {
        if (this.methodCache.has(method)) {
            return this.methodCache.get(method);
        }
        const validMethods = Object.values(exports.ASSURANCE_LEVEL_METADATA).flatMap((meta) => meta.verificationMethods);
        const valid = validMethods.includes(method);
        this.methodCache.set(method, valid);
        return valid;
    }
    /**
     * Fast assurance level comparison
     */
    compareLevels(level1, level2) {
        const meta1 = exports.ASSURANCE_LEVEL_METADATA[level1];
        const meta2 = exports.ASSURANCE_LEVEL_METADATA[level2];
        if (!meta1 || !meta2)
            return 0;
        return meta1.order - meta2.order;
    }
    /**
     * Fast minimum assurance check
     */
    meetsMinimum(actualLevel, minimumLevel) {
        return this.compareLevels(actualLevel, minimumLevel) >= 0;
    }
    /**
     * Clear caches (useful for testing)
     */
    clearCache() {
        this.levelCache.clear();
        this.methodCache.clear();
    }
}
/**
 * Global validator instance for performance
 */
exports.assuranceValidator = new AssuranceValidator();
/**
 * Get assurance requirements for a specific level
 */
function getAssuranceRequirements(level) {
    const metadata = exports.ASSURANCE_LEVEL_METADATA[level];
    return metadata?.requirements || [];
}
/**
 * Get risk level for assurance level
 */
function getAssuranceRiskLevel(level) {
    const metadata = exports.ASSURANCE_LEVEL_METADATA[level];
    return metadata?.riskLevel || "very_high";
}
/**
 * Generate assurance badge data for UI
 */
function generateAssuranceBadgeData(assurance) {
    const metadata = exports.ASSURANCE_LEVEL_METADATA[assurance.level];
    if (!metadata)
        return null;
    return {
        level: assurance.level,
        name: metadata.name,
        color: metadata.color,
        icon: metadata.icon,
        verifiedAt: assurance.verifiedAt,
        method: assurance.method,
        riskLevel: metadata.riskLevel,
        isExpired: isAssuranceExpired(assurance),
    };
}
//# sourceMappingURL=assurance.js.map