/**
 * Controlled Taxonomy System
 *
 * This module provides controlled enums for categories and frameworks
 * with validation, display metadata, and performance optimizations.
 */

/**
 * Valid category values - single source of truth
 */
export type PassportCategory =
  | "support"
  | "commerce"
  | "devops"
  | "ops"
  | "analytics"
  | "marketing";

/**
 * Valid framework values - single source of truth
 */
export type PassportFramework =
  | "n8n"
  | "LangGraph"
  | "CrewAI"
  | "AutoGen"
  | "OpenAI"
  | "LlamaIndex"
  | "Custom";

/**
 * Category metadata for display and validation
 */
export interface CategoryMetadata {
  id: PassportCategory;
  name: string;
  description: string;
  color: string; // Hex color for UI display
  icon: string; // Icon identifier for UI
  order: number; // Display order
  capabilities: string[]; // Related capabilities
}

/**
 * Framework metadata for display and validation
 */
export interface FrameworkMetadata {
  id: PassportFramework;
  name: string;
  description: string;
  color: string; // Hex color for badges
  icon: string; // Icon identifier
  website?: string; // Official website
  order: number; // Display order
  capabilities: string[]; // Related capabilities
}

/**
 * Complete registry of valid categories with metadata
 */
export const CATEGORY_METADATA: Record<PassportCategory, CategoryMetadata> = {
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
export const FRAMEWORK_METADATA: Record<PassportFramework, FrameworkMetadata> =
  {
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
export function validateCategory(category: string): TaxonomyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Object.keys(CATEGORY_METADATA).includes(category as PassportCategory)) {
    errors.push(
      `Invalid category: ${category}. Valid categories: ${Object.keys(
        CATEGORY_METADATA
      ).join(", ")}`
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate a single framework
 */
export function validateFramework(framework: string): TaxonomyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (
    !Object.keys(FRAMEWORK_METADATA).includes(framework as PassportFramework)
  ) {
    errors.push(
      `Invalid framework: ${framework}. Valid frameworks: ${Object.keys(
        FRAMEWORK_METADATA
      ).join(", ")}`
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate categories array
 */
export function validateCategories(
  categories: string[]
): TaxonomyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

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
export function validateFrameworks(
  frameworks: string[]
): TaxonomyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

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
export function getCategoryMetadata(
  category: PassportCategory
): CategoryMetadata | undefined {
  return CATEGORY_METADATA[category];
}

/**
 * Get framework metadata by ID
 */
export function getFrameworkMetadata(
  framework: PassportFramework
): FrameworkMetadata | undefined {
  return FRAMEWORK_METADATA[framework];
}

/**
 * Get all categories sorted by display order
 */
export function getCategoriesSorted(): PassportCategory[] {
  return Object.values(CATEGORY_METADATA)
    .sort((a, b) => a.order - b.order)
    .map((cat) => cat.id);
}

/**
 * Get all frameworks sorted by display order
 */
export function getFrameworksSorted(): PassportFramework[] {
  return Object.values(FRAMEWORK_METADATA)
    .sort((a, b) => a.order - b.order)
    .map((fw) => fw.id);
}

/**
 * Get categories by capability
 */
export function getCategoriesByCapability(
  capabilityId: string
): PassportCategory[] {
  return Object.values(CATEGORY_METADATA)
    .filter(
      (cat) =>
        cat.capabilities.includes("*") ||
        cat.capabilities.includes(capabilityId)
    )
    .sort((a, b) => a.order - b.order)
    .map((cat) => cat.id);
}

/**
 * Get frameworks by capability
 */
export function getFrameworksByCapability(
  capabilityId: string
): PassportFramework[] {
  return Object.values(FRAMEWORK_METADATA)
    .filter(
      (fw) =>
        fw.capabilities.includes("*") || fw.capabilities.includes(capabilityId)
    )
    .sort((a, b) => a.order - b.order)
    .map((fw) => fw.id);
}

/**
 * OPTIMIZED: Fast validation for edge performance
 * Pre-validates common values and caches results
 */
class TaxonomyValidator {
  private categoryCache = new Map<string, boolean>();
  private frameworkCache = new Map<string, boolean>();

  /**
   * Fast category validation with caching
   */
  isValidCategory(category: string): boolean {
    if (this.categoryCache.has(category)) {
      return this.categoryCache.get(category)!;
    }

    const valid = Object.keys(CATEGORY_METADATA).includes(
      category as PassportCategory
    );
    this.categoryCache.set(category, valid);
    return valid;
  }

  /**
   * Fast framework validation with caching
   */
  isValidFramework(framework: string): boolean {
    if (this.frameworkCache.has(framework)) {
      return this.frameworkCache.get(framework)!;
    }

    const valid = Object.keys(FRAMEWORK_METADATA).includes(
      framework as PassportFramework
    );
    this.frameworkCache.set(framework, valid);
    return valid;
  }

  /**
   * Validate categories array with fast path
   */
  validateCategoriesFast(categories: string[]): {
    valid: boolean;
    invalid: string[];
  } {
    const invalid: string[] = [];

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
  validateFrameworksFast(frameworks: string[]): {
    valid: boolean;
    invalid: string[];
  } {
    const invalid: string[] = [];

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
  clearCache(): void {
    this.categoryCache.clear();
    this.frameworkCache.clear();
  }
}

/**
 * Global validator instance for performance
 */
export const taxonomyValidator = new TaxonomyValidator();

/**
 * Get display data for UI components
 */
export function getDisplayData() {
  return {
    categories: getCategoriesSorted().map((id) => CATEGORY_METADATA[id]),
    frameworks: getFrameworksSorted().map((id) => FRAMEWORK_METADATA[id]),
  };
}

/**
 * Generate badge data for AgentCard display
 */
export function generateBadgeData(
  categories: PassportCategory[],
  frameworks: PassportFramework[]
) {
  return {
    categories: categories.map((cat) => ({
      ...CATEGORY_METADATA[cat],
    })),
    frameworks: frameworks.map((fw) => ({
      ...FRAMEWORK_METADATA[fw],
    })),
  };
}
