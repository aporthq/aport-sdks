/**
 * Taxonomy Enforcement for Policy Verification
 *
 * Provides taxonomy checking for policy verification using the robust
 * taxonomy validation utilities from the main functions/utils directory.
 */

import { PassportData } from "../../../types/passport";
import { DecisionReason } from "../../../shared/types/decision";
import { validateCategory, validateFramework } from "../taxonomy";

export async function evaluateTaxonomy(
  passport: PassportData,
  policyPack: any,
  context: Record<string, any>
): Promise<{ allow: boolean; reasons: DecisionReason[] }> {
  const reasons: DecisionReason[] = [];

  // Check if policy has taxonomy requirements
  if (!policyPack.taxonomy) {
    return { allow: true, reasons };
  }

  const requiredCategories = policyPack.taxonomy.categories || [];
  const requiredFrameworks = policyPack.taxonomy.frameworks || [];

  // Check agent categories using robust validation
  if (requiredCategories.length > 0) {
    const agentCategories = passport.categories || [];
    const hasRequiredCategory = requiredCategories.some((cat: string) =>
      agentCategories.includes(cat as any)
    );

    if (!hasRequiredCategory) {
      reasons.push({
        code: "MISSING_CATEGORY",
        message: `Agent must have one of these categories: ${requiredCategories.join(
          ", "
        )}`,
        severity: "error",
      });
      return { allow: false, reasons };
    }

    // Validate category format
    for (const category of agentCategories) {
      if (!validateCategory(category).valid) {
        reasons.push({
          code: "INVALID_CATEGORY",
          message: `Category ${category} is not a valid passport category`,
          severity: "error",
        });
        return { allow: false, reasons };
      }
    }
  }

  // Check agent frameworks using robust validation
  if (requiredFrameworks.length > 0) {
    const agentFrameworks = (passport as any).frameworks || [];
    const hasRequiredFramework = requiredFrameworks.some((fw: string) =>
      agentFrameworks.includes(fw)
    );

    if (!hasRequiredFramework) {
      reasons.push({
        code: "MISSING_FRAMEWORK",
        message: `Agent must have one of these frameworks: ${requiredFrameworks.join(
          ", "
        )}`,
        severity: "error",
      });
      return { allow: false, reasons };
    }

    // Validate framework format
    for (const framework of agentFrameworks) {
      if (!validateFramework(framework).valid) {
        reasons.push({
          code: "INVALID_FRAMEWORK",
          message: `Framework ${framework} is not a valid passport framework`,
          severity: "error",
        });
        return { allow: false, reasons };
      }
    }
  }

  return { allow: true, reasons };
}
