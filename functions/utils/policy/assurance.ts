/**
 * Assurance Enforcement for Policy Verification
 *
 * Provides assurance level checking for policy verification using the robust
 * assurance utilities from the main functions/utils directory.
 */

import { PassportData } from "../../../types/passport";
import { DecisionReason } from "../../../shared/types/decision";
import { meetsMinimumAssurance, isAssuranceExpired } from "../assurance";

export async function evaluateAssurance(
  passport: PassportData,
  policyPack: any,
  context: Record<string, any>
): Promise<{ allow: boolean; reasons: DecisionReason[] }> {
  const reasons: DecisionReason[] = [];

  // Check if policy requires specific assurance level
  const requiredLevel = policyPack.assurance?.required_level || "L0";
  const agentLevel = (passport as any).assurance?.level || "L0";

  // Use robust assurance level comparison
  if (!meetsMinimumAssurance(agentLevel, requiredLevel)) {
    reasons.push({
      code: "INSUFFICIENT_ASSURANCE",
      message: `Required assurance level ${requiredLevel} not met (current: ${agentLevel})`,
      severity: "error",
    });
    return { allow: false, reasons };
  }

  // Check if assurance is expired using robust utility
  if ((passport as any).assurance?.expires_at) {
    const assurance = (passport as any).assurance;
    if (isAssuranceExpired(assurance)) {
      reasons.push({
        code: "ASSURANCE_EXPIRED",
        message: "Agent assurance has expired",
        severity: "error",
      });
      return { allow: false, reasons };
    }
  }

  return { allow: true, reasons };
}
