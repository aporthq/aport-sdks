/**
 * Taxonomy Validation SDK for Agent Passport
 *
 * Provides framework-agnostic taxonomy validation
 */
/**
 * Taxonomy validation configuration
 */
export interface TaxonomyValidationConfig {
    enabled: boolean;
    strictMode: boolean;
    logViolations: boolean;
    requireCategories?: string[];
    requireFrameworks?: string[];
}
/**
 * Taxonomy validation result
 */
export interface TaxonomyValidationResult {
    allowed: boolean;
    violations: Array<{
        type: string;
        reason: string;
        category?: string;
        framework?: string;
    }>;
    categories: string[];
    frameworks: string[];
}
/**
 * Validate agent taxonomy
 */
export declare function validateAgentTaxonomy(agent: any): {
    valid: boolean;
    categories: string[];
    frameworks: string[];
    errors: string[];
};
/**
 * Check if agent has required categories
 */
export declare function hasRequiredCategories(agent: any, requiredCategories: string[], config?: Partial<TaxonomyValidationConfig>): TaxonomyValidationResult;
/**
 * Check if agent has required frameworks
 */
export declare function hasRequiredFrameworks(agent: any, requiredFrameworks: string[], config?: Partial<TaxonomyValidationConfig>): TaxonomyValidationResult;
/**
 * Validate taxonomy for an agent
 */
export declare function validateTaxonomyForAgent(agent: any, config?: Partial<TaxonomyValidationConfig>): TaxonomyValidationResult;
/**
 * Get categories for an agent
 */
export declare function getAgentCategories(agent: any): string[];
/**
 * Get frameworks for an agent
 */
export declare function getAgentFrameworks(agent: any): string[];
//# sourceMappingURL=taxonomy-validation.d.ts.map