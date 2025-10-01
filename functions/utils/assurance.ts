/**
 * Assurance Levels System
 *
 * This module provides assurance level computation, validation, and enforcement
 * with performance optimizations for edge computing environments.
 */

/**
 * Assurance level enumeration - single source of truth
 */
export type AssuranceLevel =
  | "L0" // self-attested
  | "L1" // email_verified
  | "L2" // github_verified
  | "L3" // domain_verified (DNS TXT or /.well-known/agent-owner.json)
  | "L4KYC" // kyc_verified / kyb_verified
  | "L4FIN"; // financial_data_verified

/**
 * Assurance method enumeration
 */
export type AssuranceMethod =
  | "self_attested"
  | "email_verified"
  | "github_verified"
  | "domain_verified"
  | "kyc_verified"
  | "kyb_verified"
  | "financial_data_verified";

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
export const ASSURANCE_LEVEL_METADATA: Record<
  AssuranceLevel,
  AssuranceLevelMetadata
> = {
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
    description:
      "Domain ownership verified via DNS TXT or /.well-known/agent-owner.json",
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
export function computeAssuranceLevel(
  verificationMethods: AssuranceMethod[]
): AssuranceLevel {
  // Sort by assurance level order (highest first)
  const sortedMethods = verificationMethods
    .map((method) => {
      const level = Object.values(ASSURANCE_LEVEL_METADATA).find((meta) =>
        meta.verificationMethods.includes(method)
      );
      return { method, order: level?.order ?? -1 };
    })
    .sort((a, b) => b.order - a.order);

  if (sortedMethods.length === 0) {
    return "L0"; // Default to self-attested
  }

  // Return the highest level achieved
  const highestMethod = sortedMethods[0];
  const level = Object.values(ASSURANCE_LEVEL_METADATA).find((meta) =>
    meta.verificationMethods.includes(highestMethod.method)
  );

  return level?.level ?? "L0";
}

/**
 * Get assurance level metadata
 */
export function getAssuranceLevelMetadata(
  level: AssuranceLevel
): AssuranceLevelMetadata | undefined {
  return ASSURANCE_LEVEL_METADATA[level];
}

/**
 * Get all assurance levels sorted by order
 */
export function getAssuranceLevelsSorted(): AssuranceLevel[] {
  return Object.values(ASSURANCE_LEVEL_METADATA)
    .sort((a, b) => a.order - b.order)
    .map((meta) => meta.level);
}

/**
 * Compare assurance levels (returns -1, 0, or 1)
 */
export function compareAssuranceLevels(
  level1: AssuranceLevel,
  level2: AssuranceLevel
): number {
  const meta1 = ASSURANCE_LEVEL_METADATA[level1];
  const meta2 = ASSURANCE_LEVEL_METADATA[level2];

  if (!meta1 || !meta2) return 0;

  return meta1.order - meta2.order;
}

/**
 * Check if assurance level meets minimum requirement
 */
export function meetsMinimumAssurance(
  actualLevel: AssuranceLevel,
  minimumLevel: AssuranceLevel
): boolean {
  return compareAssuranceLevels(actualLevel, minimumLevel) >= 0;
}

/**
 * Get assurance level for specific verification method
 */
export function getAssuranceLevelForMethod(
  method: AssuranceMethod
): AssuranceLevel | undefined {
  const level = Object.values(ASSURANCE_LEVEL_METADATA).find((meta) =>
    meta.verificationMethods.includes(method)
  );
  return level?.level;
}

/**
 * Validate assurance level
 */
export function validateAssuranceLevel(level: string): {
  valid: boolean;
  level?: AssuranceLevel;
  error?: string;
} {
  if (
    !Object.keys(ASSURANCE_LEVEL_METADATA).includes(level as AssuranceLevel)
  ) {
    return {
      valid: false,
      error: `Invalid assurance level: ${level}. Valid levels: ${Object.keys(
        ASSURANCE_LEVEL_METADATA
      ).join(", ")}`,
    };
  }

  return { valid: true, level: level as AssuranceLevel };
}

/**
 * Validate assurance method
 */
export function validateAssuranceMethod(method: string): {
  valid: boolean;
  method?: AssuranceMethod;
  error?: string;
} {
  const validMethods = Object.values(ASSURANCE_LEVEL_METADATA).flatMap(
    (meta) => meta.verificationMethods
  );

  if (!validMethods.includes(method as AssuranceMethod)) {
    return {
      valid: false,
      error: `Invalid assurance method: ${method}. Valid methods: ${validMethods.join(
        ", "
      )}`,
    };
  }

  return { valid: true, method: method as AssuranceMethod };
}

/**
 * Create owner assurance record
 */
export function createOwnerAssurance(
  verificationMethods: AssuranceMethod[],
  evidence?: Record<string, any>,
  expiresAt?: string
): OwnerAssurance {
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
export function updateOwnerAssurance(
  current: OwnerAssurance,
  newVerificationMethods: AssuranceMethod[],
  evidence?: Record<string, any>,
  expiresAt?: string
): OwnerAssurance {
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
export function isAssuranceExpired(assurance: OwnerAssurance): boolean {
  if (!assurance.expiresAt) return false;
  return new Date(assurance.expiresAt) < new Date();
}

/**
 * Get assurance display data for UI
 */
export function getAssuranceDisplayData(level: AssuranceLevel) {
  const metadata = ASSURANCE_LEVEL_METADATA[level];
  if (!metadata) return null;

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
  private levelCache = new Map<string, boolean>();
  private methodCache = new Map<string, boolean>();

  /**
   * Fast assurance level validation with caching
   */
  isValidLevel(level: string): boolean {
    if (this.levelCache.has(level)) {
      return this.levelCache.get(level)!;
    }

    const valid = Object.keys(ASSURANCE_LEVEL_METADATA).includes(
      level as AssuranceLevel
    );
    this.levelCache.set(level, valid);
    return valid;
  }

  /**
   * Fast assurance method validation with caching
   */
  isValidMethod(method: string): boolean {
    if (this.methodCache.has(method)) {
      return this.methodCache.get(method)!;
    }

    const validMethods = Object.values(ASSURANCE_LEVEL_METADATA).flatMap(
      (meta) => meta.verificationMethods
    );
    const valid = validMethods.includes(method as AssuranceMethod);
    this.methodCache.set(method, valid);
    return valid;
  }

  /**
   * Fast assurance level comparison
   */
  compareLevels(level1: string, level2: string): number {
    const meta1 = ASSURANCE_LEVEL_METADATA[level1 as AssuranceLevel];
    const meta2 = ASSURANCE_LEVEL_METADATA[level2 as AssuranceLevel];

    if (!meta1 || !meta2) return 0;
    return meta1.order - meta2.order;
  }

  /**
   * Fast minimum assurance check
   */
  meetsMinimum(actualLevel: string, minimumLevel: string): boolean {
    return this.compareLevels(actualLevel, minimumLevel) >= 0;
  }

  /**
   * Clear caches (useful for testing)
   */
  clearCache(): void {
    this.levelCache.clear();
    this.methodCache.clear();
  }
}

/**
 * Global validator instance for performance
 */
export const assuranceValidator = new AssuranceValidator();

/**
 * Get assurance requirements for a specific level
 */
export function getAssuranceRequirements(level: AssuranceLevel): string[] {
  const metadata = ASSURANCE_LEVEL_METADATA[level];
  return metadata?.requirements || [];
}

/**
 * Get risk level for assurance level
 */
export function getAssuranceRiskLevel(
  level: AssuranceLevel
): "low" | "medium" | "high" | "very_high" {
  const metadata = ASSURANCE_LEVEL_METADATA[level];
  return metadata?.riskLevel || "very_high";
}

/**
 * Generate assurance badge data for UI
 */
export function generateAssuranceBadgeData(assurance: OwnerAssurance) {
  const metadata = ASSURANCE_LEVEL_METADATA[assurance.level];
  if (!metadata) return null;

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
