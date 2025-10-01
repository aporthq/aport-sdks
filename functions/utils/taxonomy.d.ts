/**
 * Controlled Taxonomy System
 *
 * This module provides controlled enums for categories and frameworks
 * with validation, display metadata, and performance optimizations.
 */
/**
 * Valid category values - single source of truth
 */
export type PassportCategory = "support" | "commerce" | "devops" | "ops" | "analytics" | "marketing";
/**
 * Valid framework values - single source of truth
 */
export type PassportFramework = "n8n" | "LangGraph" | "CrewAI" | "AutoGen" | "OpenAI" | "LlamaIndex" | "Custom";
/**
 * Category metadata for display and validation
 */
export interface CategoryMetadata {
    id: PassportCategory;
    name: string;
    description: string;
    color: string;
    icon: string;
    order: number;
    capabilities: string[];
}
/**
 * Framework metadata for display and validation
 */
export interface FrameworkMetadata {
    id: PassportFramework;
    name: string;
    description: string;
    color: string;
    icon: string;
    website?: string;
    order: number;
    capabilities: string[];
}
/**
 * Complete registry of valid categories with metadata
 */
export declare const CATEGORY_METADATA: Record<PassportCategory, CategoryMetadata>;
/**
 * Complete registry of valid frameworks with metadata
 */
export declare const FRAMEWORK_METADATA: Record<PassportFramework, FrameworkMetadata>;
/**
 * Validation result for taxonomy
 */
export interface TaxonomyValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
/**
 * Validate a single category
 */
export declare function validateCategory(category: string): TaxonomyValidationResult;
/**
 * Validate a single framework
 */
export declare function validateFramework(framework: string): TaxonomyValidationResult;
/**
 * Validate categories array
 */
export declare function validateCategories(categories: string[]): TaxonomyValidationResult;
/**
 * Validate frameworks array
 */
export declare function validateFrameworks(frameworks: string[]): TaxonomyValidationResult;
/**
 * Get category metadata by ID
 */
export declare function getCategoryMetadata(category: PassportCategory): CategoryMetadata | undefined;
/**
 * Get framework metadata by ID
 */
export declare function getFrameworkMetadata(framework: PassportFramework): FrameworkMetadata | undefined;
/**
 * Get all categories sorted by display order
 */
export declare function getCategoriesSorted(): PassportCategory[];
/**
 * Get all frameworks sorted by display order
 */
export declare function getFrameworksSorted(): PassportFramework[];
/**
 * Get categories by capability
 */
export declare function getCategoriesByCapability(capabilityId: string): PassportCategory[];
/**
 * Get frameworks by capability
 */
export declare function getFrameworksByCapability(capabilityId: string): PassportFramework[];
/**
 * OPTIMIZED: Fast validation for edge performance
 * Pre-validates common values and caches results
 */
declare class TaxonomyValidator {
    private categoryCache;
    private frameworkCache;
    /**
     * Fast category validation with caching
     */
    isValidCategory(category: string): boolean;
    /**
     * Fast framework validation with caching
     */
    isValidFramework(framework: string): boolean;
    /**
     * Validate categories array with fast path
     */
    validateCategoriesFast(categories: string[]): {
        valid: boolean;
        invalid: string[];
    };
    /**
     * Validate frameworks array with fast path
     */
    validateFrameworksFast(frameworks: string[]): {
        valid: boolean;
        invalid: string[];
    };
    /**
     * Clear caches (useful for testing)
     */
    clearCache(): void;
}
/**
 * Global validator instance for performance
 */
export declare const taxonomyValidator: TaxonomyValidator;
/**
 * Get display data for UI components
 */
export declare function getDisplayData(): {
    categories: CategoryMetadata[];
    frameworks: FrameworkMetadata[];
};
/**
 * Generate badge data for AgentCard display
 */
export declare function generateBadgeData(categories: PassportCategory[], frameworks: PassportFramework[]): {
    categories: {
        id: PassportCategory;
        name: string;
        description: string;
        color: string;
        icon: string;
        order: number;
        capabilities: string[];
    }[];
    frameworks: {
        id: PassportFramework;
        name: string;
        description: string;
        color: string;
        icon: string;
        website?: string;
        order: number;
        capabilities: string[];
    }[];
};
export {};
//# sourceMappingURL=taxonomy.d.ts.map