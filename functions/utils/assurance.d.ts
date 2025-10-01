/**
 * Assurance Levels System
 *
 * This module provides assurance level computation, validation, and enforcement
 * with performance optimizations for edge computing environments.
 */
/**
 * Assurance level enumeration - single source of truth
 */
export type AssuranceLevel = "L0" | "L1" | "L2" | "L3" | "L4KYC" | "L4FIN";
/**
 * Assurance method enumeration
 */
export type AssuranceMethod = "self_attested" | "email_verified" | "github_verified" | "domain_verified" | "kyc_verified" | "kyb_verified" | "financial_data_verified";
/**
 * Assurance level metadata
 */
export interface AssuranceLevelMetadata {
    level: AssuranceLevel;
    name: string;
    description: string;
    requirements: string[];
    verificationMethods: AssuranceMethod[];
    riskLevel: "low" | "medium" | "high" | "very_high";
    order: number;
    color: string;
    icon: string;
}
/**
 * Complete registry of assurance levels with metadata
 */
export declare const ASSURANCE_LEVEL_METADATA: Record<AssuranceLevel, AssuranceLevelMetadata>;
/**
 * Assurance verification result
 */
export interface AssuranceVerificationResult {
    level: AssuranceLevel;
    method: AssuranceMethod;
    verifiedAt: string;
    evidence?: Record<string, any>;
    expiresAt?: string;
}
/**
 * Owner assurance data structure
 */
export interface OwnerAssurance {
    level: AssuranceLevel;
    method: AssuranceMethod;
    verifiedAt: string;
    evidence?: Record<string, any>;
    expiresAt?: string;
    lastUpdated: string;
}
/**
 * Compute assurance level from verification methods
 */
export declare function computeAssuranceLevel(verificationMethods: AssuranceMethod[]): AssuranceLevel;
/**
 * Get assurance level metadata
 */
export declare function getAssuranceLevelMetadata(level: AssuranceLevel): AssuranceLevelMetadata | undefined;
/**
 * Get all assurance levels sorted by order
 */
export declare function getAssuranceLevelsSorted(): AssuranceLevel[];
/**
 * Compare assurance levels (returns -1, 0, or 1)
 */
export declare function compareAssuranceLevels(level1: AssuranceLevel, level2: AssuranceLevel): number;
/**
 * Check if assurance level meets minimum requirement
 */
export declare function meetsMinimumAssurance(actualLevel: AssuranceLevel, minimumLevel: AssuranceLevel): boolean;
/**
 * Get assurance level for specific verification method
 */
export declare function getAssuranceLevelForMethod(method: AssuranceMethod): AssuranceLevel | undefined;
/**
 * Validate assurance level
 */
export declare function validateAssuranceLevel(level: string): {
    valid: boolean;
    level?: AssuranceLevel;
    error?: string;
};
/**
 * Validate assurance method
 */
export declare function validateAssuranceMethod(method: string): {
    valid: boolean;
    method?: AssuranceMethod;
    error?: string;
};
/**
 * Create owner assurance record
 */
export declare function createOwnerAssurance(verificationMethods: AssuranceMethod[], evidence?: Record<string, any>, expiresAt?: string): OwnerAssurance;
/**
 * Update owner assurance record
 */
export declare function updateOwnerAssurance(current: OwnerAssurance, newVerificationMethods: AssuranceMethod[], evidence?: Record<string, any>, expiresAt?: string): OwnerAssurance;
/**
 * Check if assurance is expired
 */
export declare function isAssuranceExpired(assurance: OwnerAssurance): boolean;
/**
 * Get assurance display data for UI
 */
export declare function getAssuranceDisplayData(level: AssuranceLevel): {
    level: AssuranceLevel;
    name: string;
    description: string;
    color: string;
    icon: string;
    riskLevel: "low" | "medium" | "high" | "very_high";
    requirements: string[];
} | null;
/**
 * OPTIMIZED: Fast assurance validation for edge performance
 */
declare class AssuranceValidator {
    private levelCache;
    private methodCache;
    /**
     * Fast assurance level validation with caching
     */
    isValidLevel(level: string): boolean;
    /**
     * Fast assurance method validation with caching
     */
    isValidMethod(method: string): boolean;
    /**
     * Fast assurance level comparison
     */
    compareLevels(level1: string, level2: string): number;
    /**
     * Fast minimum assurance check
     */
    meetsMinimum(actualLevel: string, minimumLevel: string): boolean;
    /**
     * Clear caches (useful for testing)
     */
    clearCache(): void;
}
/**
 * Global validator instance for performance
 */
export declare const assuranceValidator: AssuranceValidator;
/**
 * Get assurance requirements for a specific level
 */
export declare function getAssuranceRequirements(level: AssuranceLevel): string[];
/**
 * Get risk level for assurance level
 */
export declare function getAssuranceRiskLevel(level: AssuranceLevel): "low" | "medium" | "high" | "very_high";
/**
 * Generate assurance badge data for UI
 */
export declare function generateAssuranceBadgeData(assurance: OwnerAssurance): {
    level: AssuranceLevel;
    name: string;
    color: string;
    icon: string;
    verifiedAt: string;
    method: AssuranceMethod;
    riskLevel: "low" | "medium" | "high" | "very_high";
    isExpired: boolean;
} | null;
export {};
//# sourceMappingURL=assurance.d.ts.map