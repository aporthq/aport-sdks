/**
 * Policy Evaluation Utilities
 *
 * Computes policy compliance evaluation for passports
 * Used to populate the evaluation field in passport data
 */

import { PassportData } from "../../types/passport";

export interface PolicyPack {
  id: string;
  name: string;
  requires_capabilities: string[];
  min_assurance: string;
  limits_required: string[];
  enforcement: Record<string, any>;
  mcp_requirements?: {
    required_servers?: string[];
    required_tools?: string[];
    max_servers?: number;
    max_tools?: number;
  };
}

export interface PolicyEvaluation {
  pack_id: string;
  assurance_ok: boolean;
  capability_ok: boolean;
  limits_ok: boolean;
  regions_ok: boolean;
  mcp_ok: boolean;
  context_ok: boolean;
  reasons: string[];
}

/**
 * Determine which policy pack applies to a passport
 */
export function determinePolicyPack(passport: PassportData): string {
  const capabilities = passport.capabilities || [];
  const capabilityIds = capabilities.map((c) => c.id || "").filter(Boolean);

  // Check for messaging capability
  if (
    capabilityIds.some(
      (id) =>
        id.includes("messaging.send") ||
        id.includes("messaging") ||
        id.includes("slack") ||
        id.includes("discord") ||
        id.includes("email")
    )
  ) {
    return "messaging.v1";
  }

  // Check for repository capabilities
  if (
    capabilityIds.some(
      (id) =>
        id.includes("repo.pr.create") ||
        id.includes("repo.merge") ||
        id.includes("repo") ||
        id.includes("git") ||
        id.includes("github") ||
        id.includes("gitlab")
    )
  ) {
    return "repo.v1";
  }

  // Check for refunds capability
  if (
    capabilityIds.some(
      (id) =>
        id.includes("refund") ||
        id.includes("payment") ||
        id.includes("stripe") ||
        id.includes("commerce")
    )
  ) {
    return "payments.refund.v1";
  }

  // Check for data export capability
  if (
    capabilityIds.some(
      (id) =>
        id.includes("export") ||
        id.includes("data") ||
        id.includes("csv") ||
        id.includes("download")
    )
  ) {
    return "data.export.v1";
  }

  // Default to none if no specific policy applies
  return "none";
}

/**
 * Load policy pack configuration
 */
export async function loadPolicyPack(
  packId: string,
  registry: KVNamespace
): Promise<PolicyPack | null> {
  if (packId === "none") {
    return {
      id: "none",
      name: "No Policy Required",
      requires_capabilities: [],
      min_assurance: "L0",
      limits_required: [],
      enforcement: {},
    };
  }

  try {
    // Try to load from KV first (cached)
    const cached = await registry.get(`policy_pack:${packId}`, "json");
    if (cached) {
      return cached as PolicyPack;
    }

    // Fallback to hardcoded policy packs
    switch (packId) {
      case "messaging.v1":
        return {
          id: "messaging.v1",
          name: "Messaging Protection",
          requires_capabilities: ["messaging.send"],
          min_assurance: "L1",
          limits_required: ["msgs_per_min", "msgs_per_day"],
          enforcement: {
            channels_allowlist_enforced: true,
            mention_policy_enforced: true,
            rate_limits_enforced: true,
          },
          mcp_requirements: {
            max_servers: 5,
            max_tools: 10,
          },
        };

      case "repo.v1":
        return {
          id: "repo.v1",
          name: "Repository Safety",
          requires_capabilities: ["repo.pr.create", "repo.merge"],
          min_assurance: "L2",
          limits_required: [
            "max_prs_per_day",
            "max_merges_per_day",
            "max_pr_size_kb",
          ],
          enforcement: {
            allowed_repos_enforced: true,
            allowed_base_branches_enforced: true,
            path_allowlist_enforced: true,
          },
          mcp_requirements: {
            max_servers: 3,
            max_tools: 15,
          },
        };

      case "payments.refund.v1":
        return {
          id: "payments.refund.v1",
          name: "Refunds Policy v1",
          requires_capabilities: ["payments.refund"],
          min_assurance: "L1",
          limits_required: [
            "refund_amount_max_per_tx",
            "refund_amount_daily_cap",
          ],
          enforcement: {
            region_in: ["US", "EU"],
          },
          mcp_requirements: {
            max_servers: 10,
            max_tools: 20,
          },
        };

      case "data.export.v1":
        return {
          id: "data.export.v1",
          name: "Data Export Policy v1",
          requires_capabilities: ["data_export"],
          min_assurance: "L2",
          limits_required: ["max_export_rows", "allow_pii"],
          enforcement: {
            region_in: ["US", "EU", "CA"],
          },
          mcp_requirements: {
            max_servers: 5,
            max_tools: 10,
          },
        };

      default:
        return null;
    }
  } catch (error) {
    console.error(`Failed to load policy pack ${packId}:`, error);
    return null;
  }
}

/**
 * Evaluate passport against policy requirements
 */
export function evaluatePassportAgainstPolicy(
  passport: PassportData,
  policy: PolicyPack,
  context?: any
): PolicyEvaluation {
  const reasons: string[] = [];

  // Check capabilities
  const passportCapabilities = (passport.capabilities || [])
    .map((c) => c.id || "")
    .filter(Boolean);

  const capability_ok = policy.requires_capabilities.every((required) => {
    const hasCapability = passportCapabilities.some(
      (cap) => cap === required || cap.includes(required)
    );
    if (!hasCapability) {
      reasons.push(`Missing required capability: ${required}`);
    }
    return hasCapability;
  });

  // Check assurance level
  const assuranceLevels = ["L0", "L1", "L2", "L3", "L4KYC", "L4FIN"];
  const requiredLevelIndex = assuranceLevels.indexOf(policy.min_assurance);
  const passportLevelIndex = assuranceLevels.indexOf(passport.assurance_level);

  const assurance_ok = passportLevelIndex >= requiredLevelIndex;
  if (!assurance_ok) {
    reasons.push(
      `Insufficient assurance level: ${passport.assurance_level} < ${policy.min_assurance}`
    );
  }

  // Check limits
  const limits_ok = policy.limits_required.every((limit) => {
    const hasLimit = passport.limits && passport.limits.hasOwnProperty(limit);
    if (!hasLimit) {
      reasons.push(`Missing required limit: ${limit}`);
    }
    return hasLimit;
  });

  // Check regions
  let regions_ok = true;
  if (
    policy.enforcement.region_in &&
    Array.isArray(policy.enforcement.region_in)
  ) {
    const requiredRegions = policy.enforcement.region_in;
    const passportRegions = passport.regions || [];

    regions_ok = requiredRegions.some(
      (required) =>
        passportRegions.includes(required) || passportRegions.includes("global")
    );

    if (!regions_ok) {
      reasons.push(
        `Passport regions [${passportRegions.join(
          ", "
        )}] do not include required regions [${requiredRegions.join(", ")}]`
      );
    }
  }

  // Check MCP requirements
  let mcp_ok = true;
  if (policy.mcp_requirements) {
    const mcpReqs = policy.mcp_requirements;
    const mcpData = passport.mcp;

    // Check server limits
    if (mcpReqs.max_servers && mcpData?.servers) {
      if (mcpData.servers.length > mcpReqs.max_servers) {
        mcp_ok = false;
        reasons.push(
          `Too many MCP servers: ${mcpData.servers.length} > ${mcpReqs.max_servers}`
        );
      }
    }

    // Check tool limits
    if (mcpReqs.max_tools && mcpData?.tools) {
      if (mcpData.tools.length > mcpReqs.max_tools) {
        mcp_ok = false;
        reasons.push(
          `Too many MCP tools: ${mcpData.tools.length} > ${mcpReqs.max_tools}`
        );
      }
    }

    // Check required servers
    if (mcpReqs.required_servers && mcpReqs.required_servers.length > 0) {
      const hasRequiredServers = mcpReqs.required_servers.every((required) =>
        mcpData?.servers?.includes(required)
      );
      if (!hasRequiredServers) {
        mcp_ok = false;
        reasons.push(
          `Missing required MCP servers: ${mcpReqs.required_servers.join(", ")}`
        );
      }
    }

    // Check required tools
    if (mcpReqs.required_tools && mcpReqs.required_tools.length > 0) {
      const hasRequiredTools = mcpReqs.required_tools.every((required) =>
        mcpData?.tools?.includes(required)
      );
      if (!hasRequiredTools) {
        mcp_ok = false;
        reasons.push(
          `Missing required MCP tools: ${mcpReqs.required_tools.join(", ")}`
        );
      }
    }
  }

  // Context validation is handled in the API endpoint, not here
  const context_ok = true;

  return {
    pack_id: policy.id,
    assurance_ok,
    capability_ok,
    limits_ok,
    regions_ok,
    mcp_ok,
    context_ok,
    reasons,
  };
}

/**
 * Compute evaluation for a passport (main function)
 */
export async function computePassportEvaluation(
  passport: PassportData,
  registry: KVNamespace,
  specificPackId?: string,
  context?: any
): Promise<PolicyEvaluation> {
  // Use specific pack ID if provided, otherwise determine which policy pack applies
  const packId = specificPackId || determinePolicyPack(passport);

  // Load the policy pack
  const policy = await loadPolicyPack(packId, registry);

  if (!policy) {
    // If no policy found, return a default "none" evaluation
    return {
      pack_id: "none",
      assurance_ok: true,
      capability_ok: true,
      limits_ok: true,
      regions_ok: true,
      mcp_ok: true,
      reasons: [],
    };
  }

  // Evaluate the passport against the policy
  return evaluatePassportAgainstPolicy(passport, policy, context);
}
