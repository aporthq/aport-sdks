/**
 * Capability Enforcement for Policy Verification
 *
 * Provides capability checking for policy verification using the robust
 * capability utilities from the main functions/utils directory.
 */

import { PassportData } from "../../../types/passport";
import { DecisionReason } from "../../../shared/types/decision";
import { isValidCapabilityId, validateCapabilities } from "../capabilities";

export async function checkCapabilities(
  passport: PassportData,
  requiredCapabilities: string[]
): Promise<{ allow: boolean; reasons: DecisionReason[] }> {
  const reasons: DecisionReason[] = [];

  // Validate capability IDs first
  const invalidCapabilities = validateCapabilities(requiredCapabilities);
  if (invalidCapabilities.length > 0) {
    reasons.push({
      code: "INVALID_CAPABILITIES",
      message: `Invalid capability IDs: ${invalidCapabilities.join(", ")}`,
      severity: "error",
    });
    return { allow: false, reasons };
  }

  // Check if agent has required capabilities
  if (!passport.capabilities || passport.capabilities.length === 0) {
    reasons.push({
      code: "NO_CAPABILITIES",
      message: "Agent has no capabilities defined",
      severity: "error",
    });
    return { allow: false, reasons };
  }

  const agentCapabilities = passport.capabilities.map(
    (cap: any) => cap.id || cap
  );
  const missing = requiredCapabilities.filter(
    (cap) => !agentCapabilities.includes(cap)
  );

  if (missing.length > 0) {
    reasons.push({
      code: "INSUFFICIENT_CAPABILITIES",
      message: `Missing required capabilities: ${missing.join(", ")}`,
      severity: "error",
    });
    return { allow: false, reasons };
  }

  return { allow: true, reasons };
}

/**
 * Check if agent has specific capability
 */
export function hasSpecificCapability(
  passport: PassportData,
  capability: string
): boolean {
  if (!passport.capabilities || passport.capabilities.length === 0) {
    return false;
  }

  const agentCapabilities = passport.capabilities.map(
    (cap: any) => cap.id || cap
  );
  return agentCapabilities.includes(capability);
}
