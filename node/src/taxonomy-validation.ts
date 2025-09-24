/**
 * Taxonomy Validation SDK for Agent Passport
 *
 * Provides framework-agnostic taxonomy validation
 */

import {
  validateCategories,
  validateFrameworks,
  taxonomyValidator,
  getCategoriesByCapability,
  getFrameworksByCapability,
} from "../../../functions/utils/taxonomy";

/**
 * Taxonomy validation configuration
 */
export interface TaxonomyValidationConfig {
  enabled: boolean;
  strictMode: boolean; // If true, reject requests with invalid taxonomy
  logViolations: boolean; // Log taxonomy violations for monitoring
  requireCategories?: string[]; // Required categories
  requireFrameworks?: string[]; // Required frameworks
}

/**
 * Default taxonomy validation configuration
 */
const DEFAULT_CONFIG: TaxonomyValidationConfig = {
  enabled: true,
  strictMode: true,
  logViolations: true,
};

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
export function validateAgentTaxonomy(agent: any): {
  valid: boolean;
  categories: string[];
  frameworks: string[];
  errors: string[];
} {
  if (!agent || !agent.capabilities) {
    return {
      valid: false,
      categories: [],
      frameworks: [],
      errors: ["No capabilities configured"],
    };
  }

  const capabilities = agent.capabilities.map((cap: any) => cap.id || cap);
  const categories = getCategoriesByCapability(capabilities);
  const frameworks = getFrameworksByCapability(capabilities);

  const categoryValidation = validateCategories(categories);
  const frameworkValidation = validateFrameworks(frameworks);

  const errors: string[] = [];
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
export function hasRequiredCategories(
  agent: any,
  requiredCategories: string[],
  config: Partial<TaxonomyValidationConfig> = {}
): TaxonomyValidationResult {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  if (!finalConfig.enabled) {
    return {
      allowed: true,
      violations: [],
      categories: [],
      frameworks: [],
    };
  }

  const violations: Array<{
    type: string;
    reason: string;
    category?: string;
  }> = [];

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

  const capabilities = agent.capabilities.map((cap: any) => cap.id || cap);
  const agentCategories = getCategoriesByCapability(capabilities);

  for (const requiredCategory of requiredCategories) {
    if (!agentCategories.includes(requiredCategory as any)) {
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
export function hasRequiredFrameworks(
  agent: any,
  requiredFrameworks: string[],
  config: Partial<TaxonomyValidationConfig> = {}
): TaxonomyValidationResult {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  if (!finalConfig.enabled) {
    return {
      allowed: true,
      violations: [],
      categories: [],
      frameworks: [],
    };
  }

  const violations: Array<{
    type: string;
    reason: string;
    framework?: string;
  }> = [];

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

  const capabilities = agent.capabilities.map((cap: any) => cap.id || cap);
  const agentFrameworks = getFrameworksByCapability(capabilities);

  for (const requiredFramework of requiredFrameworks) {
    if (!agentFrameworks.includes(requiredFramework as any)) {
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
export function validateTaxonomyForAgent(
  agent: any,
  config: Partial<TaxonomyValidationConfig> = {}
): TaxonomyValidationResult {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  if (!finalConfig.enabled) {
    return {
      allowed: true,
      violations: [],
      categories: [],
      frameworks: [],
    };
  }

  const violations: Array<{
    type: string;
    reason: string;
    category?: string;
    framework?: string;
  }> = [];

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

  const capabilities = agent.capabilities.map((cap: any) => cap.id || cap);
  const categories = getCategoriesByCapability(capabilities);
  const frameworks = getFrameworksByCapability(capabilities);

  // Validate categories
  const categoryValidation = validateCategories(categories);
  if (!categoryValidation.valid) {
    violations.push({
      type: "invalid_categories",
      reason: `Invalid categories: ${categoryValidation.errors?.join(", ")}`,
    });
  }

  // Validate frameworks
  const frameworkValidation = validateFrameworks(frameworks);
  if (!frameworkValidation.valid) {
    violations.push({
      type: "invalid_frameworks",
      reason: `Invalid frameworks: ${frameworkValidation.errors?.join(", ")}`,
    });
  }

  // Check required categories
  if (finalConfig.requireCategories) {
    for (const requiredCategory of finalConfig.requireCategories) {
      if (!categories.includes(requiredCategory as any)) {
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
      if (!frameworks.includes(requiredFramework as any)) {
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
export function getAgentCategories(agent: any): string[] {
  if (!agent || !agent.capabilities) {
    return [];
  }
  const capabilities = agent.capabilities.map((cap: any) => cap.id || cap);
  return getCategoriesByCapability(capabilities);
}

/**
 * Get frameworks for an agent
 */
export function getAgentFrameworks(agent: any): string[] {
  if (!agent || !agent.capabilities) {
    return [];
  }
  const capabilities = agent.capabilities.map((cap: any) => cap.id || cap);
  return getFrameworksByCapability(capabilities);
}
