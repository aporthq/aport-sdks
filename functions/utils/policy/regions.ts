/**
 * Regions Enforcement for Policy Verification
 *
 * Provides region checking for policy verification using the robust
 * region validation utilities from the main functions/utils directory.
 */

import { PassportData } from "../../../types/passport";
import { DecisionReason } from "../../../shared/types/decision";
import { isValidCountryCode } from "../regions";

export async function evaluateRegions(
  passport: PassportData,
  policyPack: any,
  context: Record<string, any>
): Promise<{ allow: boolean; reasons: DecisionReason[] }> {
  const reasons: DecisionReason[] = [];

  // Check if policy has region restrictions
  if (!policyPack.regions) {
    return { allow: true, reasons };
  }

  const allowedRegions = policyPack.regions.allowed || [];
  const blockedRegions = policyPack.regions.blocked || [];

  // Get region from context or passport
  const region = context.region || passport.regions?.[0] || "US";

  // Validate region format using robust utility
  if (!isValidCountryCode(region)) {
    reasons.push({
      code: "INVALID_REGION",
      message: `Region ${region} is not a valid ISO-3166 country code`,
      severity: "error",
    });
    return { allow: false, reasons };
  }

  // Check if region is blocked
  if (blockedRegions.includes(region)) {
    reasons.push({
      code: "REGION_BLOCKED",
      message: `Region ${region} is blocked for this policy`,
      severity: "error",
    });
    return { allow: false, reasons };
  }

  // Check if region is allowed (if allowlist exists)
  if (allowedRegions.length > 0 && !allowedRegions.includes(region)) {
    reasons.push({
      code: "REGION_NOT_ALLOWED",
      message: `Region ${region} is not allowed for this policy`,
      severity: "error",
    });
    return { allow: false, reasons };
  }

  return { allow: true, reasons };
}
