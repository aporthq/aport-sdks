/**
 * Capability Registry - Single source of truth for capability IDs
 *
 * This module provides the standardized capability registry that all
 * components use to validate and enforce capability requirements.
 */

import { CapabilityId } from "../../types/owner";

/**
 * Complete registry of all valid capability IDs
 *
 * This is the single source of truth for capability validation.
 * Any capability not in this registry will be rejected with HTTP 400.
 */
export const CAPABILITIES: CapabilityId[] = [
  "payments.refund",
  "payments.payout",
  "returns.process",
  "inventory.adjust",
  "data.export",
  "data.delete",
  "identity.manage_roles",
  "messaging.send",
  "crm.update",
  "repo.merge",
  "repo.pr.create",
  "infra.deploy",
];

/**
 * Capability metadata for enhanced functionality
 */
export interface CapabilityMetadata {
  id: CapabilityId;
  name: string;
  description: string;
  category:
    | "payments"
    | "data"
    | "identity"
    | "messaging"
    | "crm"
    | "repo"
    | "infra"
    | "returns"
    | "inventory";
  riskLevel: "low" | "medium" | "high" | "critical";
  requiresParams?: boolean;
  paramSchema?: Record<
    string,
    {
      type: "string" | "number" | "boolean";
      required: boolean;
      description: string;
    }
  >;
  relatedLimits?: string[];
}

/**
 * Enhanced capability registry with metadata
 */
export const CAPABILITY_METADATA: Record<CapabilityId, CapabilityMetadata> = {
  "payments.refund": {
    id: "payments.refund",
    name: "Payment Refunds",
    description: "Process payment refunds and chargebacks",
    category: "payments",
    riskLevel: "high",
    requiresParams: true,
    paramSchema: {
      max_amount: {
        type: "number",
        required: false,
        description: "Maximum refund amount in cents",
      },
      currency: {
        type: "string",
        required: false,
        description: "Currency code (e.g., USD, EUR)",
      },
    },
    relatedLimits: ["refund_amount_max_per_tx", "refund_amount_daily_cap"],
  },
  "payments.payout": {
    id: "payments.payout",
    name: "Payment Payouts",
    description: "Process payments to external accounts",
    category: "payments",
    riskLevel: "critical",
    requiresParams: true,
    paramSchema: {
      max_amount: {
        type: "number",
        required: false,
        description: "Maximum payout amount in cents",
      },
      allowed_methods: {
        type: "string",
        required: false,
        description: "Comma-separated list of allowed payout methods",
      },
    },
    relatedLimits: ["payout_usd_daily_cap"],
  },
  "returns.process": {
    id: "returns.process",
    name: "Process Returns",
    description: "Handle product returns and exchanges",
    category: "returns",
    riskLevel: "medium",
    requiresParams: false,
  },
  "inventory.adjust": {
    id: "inventory.adjust",
    name: "Inventory Management",
    description: "Adjust inventory levels and stock",
    category: "inventory",
    riskLevel: "medium",
    requiresParams: true,
    paramSchema: {
      max_adjustment: {
        type: "number",
        required: false,
        description: "Maximum inventory adjustment amount",
      },
      require_approval: {
        type: "boolean",
        required: false,
        description: "Whether adjustments require approval",
      },
    },
  },
  "data.export": {
    id: "data.export",
    name: "Data Export",
    description: "Export sensitive data and reports",
    category: "data",
    riskLevel: "high",
    requiresParams: true,
    paramSchema: {
      allowed_formats: {
        type: "string",
        required: false,
        description: "Comma-separated list of allowed export formats",
      },
      max_records: {
        type: "number",
        required: false,
        description: "Maximum number of records to export",
      },
    },
    relatedLimits: ["max_export_rows", "allow_pii"],
  },
  "data.delete": {
    id: "data.delete",
    name: "Data Deletion",
    description: "Permanently delete sensitive data",
    category: "data",
    riskLevel: "critical",
    requiresParams: true,
    paramSchema: {
      require_confirmation: {
        type: "boolean",
        required: true,
        description: "Whether deletion requires confirmation",
      },
      retention_days: {
        type: "number",
        required: false,
        description: "Number of days to retain before deletion",
      },
    },
    relatedLimits: ["allow_pii"],
  },
  "identity.manage_roles": {
    id: "identity.manage_roles",
    name: "Role Management",
    description: "Manage user roles and permissions",
    category: "identity",
    riskLevel: "high",
    requiresParams: true,
    paramSchema: {
      allowed_roles: {
        type: "string",
        required: false,
        description: "Comma-separated list of roles that can be assigned",
      },
      require_approval: {
        type: "boolean",
        required: false,
        description: "Whether role changes require approval",
      },
    },
  },
  "messaging.send": {
    id: "messaging.send",
    name: "Send Messages",
    description:
      "Send messages and notifications via Slack, Discord, Email and other channels",
    category: "messaging",
    riskLevel: "low",
    requiresParams: true,
    paramSchema: {
      channels_allowlist: {
        type: "string",
        required: false,
        description:
          "Comma-separated list of allowed channels (slack, discord, email)",
      },
      max_recipients: {
        type: "number",
        required: false,
        description: "Maximum number of recipients per message",
      },
      mention_policy: {
        type: "string",
        required: false,
        description: "Policy for @mentions (none, limited, all)",
      },
    },
    relatedLimits: ["msgs_per_min", "msgs_per_day"],
  },
  "crm.update": {
    id: "crm.update",
    name: "CRM Updates",
    description: "Update customer relationship management data",
    category: "crm",
    riskLevel: "medium",
    requiresParams: true,
    paramSchema: {
      allowed_fields: {
        type: "string",
        required: false,
        description: "Comma-separated list of allowed fields to update",
      },
      require_validation: {
        type: "boolean",
        required: false,
        description: "Whether updates require validation",
      },
    },
    relatedLimits: ["allow_pii"],
  },
  "repo.merge": {
    id: "repo.merge",
    name: "Repository Merge",
    description:
      "Merge code changes and pull requests with governance controls",
    category: "repo",
    riskLevel: "high",
    requiresParams: true,
    paramSchema: {
      allowed_repos: {
        type: "string",
        required: false,
        description: "Comma-separated list of allowed repositories",
      },
      allowed_base_branches: {
        type: "string",
        required: false,
        description:
          "Comma-separated list of allowed base branches (main, develop)",
      },
      required_labels: {
        type: "string",
        required: false,
        description: "Comma-separated list of required PR labels",
      },
      required_reviews: {
        type: "number",
        required: false,
        description: "Minimum number of required reviews",
      },
      path_allowlist: {
        type: "string",
        required: false,
        description: "Comma-separated list of allowed file paths/patterns",
      },
    },
    relatedLimits: ["max_merges_per_day", "max_pr_size_kb"],
  },
  "repo.pr.create": {
    id: "repo.pr.create",
    name: "Create Pull Requests",
    description: "Create pull requests with safety controls to prevent spam",
    category: "repo",
    riskLevel: "medium",
    requiresParams: true,
    paramSchema: {
      allowed_repos: {
        type: "string",
        required: false,
        description: "Comma-separated list of allowed repositories",
      },
      allowed_base_branches: {
        type: "string",
        required: false,
        description: "Comma-separated list of allowed base branches",
      },
      path_allowlist: {
        type: "string",
        required: false,
        description: "Comma-separated list of allowed file paths/patterns",
      },
      max_files_changed: {
        type: "number",
        required: false,
        description: "Maximum number of files that can be changed in one PR",
      },
      max_total_added_lines: {
        type: "number",
        required: false,
        description: "Maximum total lines that can be added in one PR",
      },
    },
    relatedLimits: ["max_prs_per_day"],
  },
  "infra.deploy": {
    id: "infra.deploy",
    name: "Infrastructure Deployment",
    description: "Deploy applications and infrastructure changes",
    category: "infra",
    riskLevel: "critical",
    requiresParams: true,
    paramSchema: {
      allowed_environments: {
        type: "string",
        required: false,
        description: "Comma-separated list of allowed deployment environments",
      },
      require_approval: {
        type: "boolean",
        required: false,
        description: "Whether deployments require approval",
      },
    },
    relatedLimits: ["max_deploys_per_day"],
  },
};

/**
 * Validate that a capability ID exists in the registry
 *
 * @param capabilityId - The capability ID to validate
 * @returns true if valid, false otherwise
 */
export function isValidCapabilityId(
  capabilityId: string
): capabilityId is CapabilityId {
  return CAPABILITIES.includes(capabilityId as CapabilityId);
}

/**
 * Validate an array of capability IDs
 *
 * @param capabilities - Array of capability IDs to validate
 * @returns Array of invalid capability IDs
 */
export function validateCapabilities(capabilities: string[]): string[] {
  return capabilities.filter((capability) => !isValidCapabilityId(capability));
}

/**
 * Get capability metadata by ID
 *
 * @param capabilityId - The capability ID
 * @returns Capability metadata or undefined if not found
 */
export function getCapabilityMetadata(
  capabilityId: CapabilityId
): CapabilityMetadata | undefined {
  return CAPABILITY_METADATA[capabilityId];
}

/**
 * Get all capabilities by category
 *
 * @param category - The category to filter by
 * @returns Array of capability IDs in the category
 */
export function getCapabilitiesByCategory(
  category: CapabilityMetadata["category"]
): CapabilityId[] {
  return Object.values(CAPABILITY_METADATA)
    .filter((meta) => meta.category === category)
    .map((meta) => meta.id);
}

/**
 * Get high-risk capabilities
 *
 * @returns Array of high-risk capability IDs
 */
export function getHighRiskCapabilities(): CapabilityId[] {
  return Object.values(CAPABILITY_METADATA)
    .filter(
      (meta) => meta.riskLevel === "high" || meta.riskLevel === "critical"
    )
    .map((meta) => meta.id);
}

/**
 * Extract capability IDs from a capabilities array
 * OPTIMIZED: Fast path for edge performance
 *
 * @param capabilities - Array of capabilities (strings or objects)
 * @returns Array of capability ID strings
 */
export function extractCapabilityIds(capabilities: any[]): string[] {
  // Fast path: if all capabilities are strings, return as-is
  if (capabilities.length === 0) return [];

  // Check if all are strings (most common case)
  let allStrings = true;
  for (let i = 0; i < capabilities.length; i++) {
    if (typeof capabilities[i] !== "string") {
      allStrings = false;
      break;
    }
  }

  if (allStrings) {
    return capabilities as string[];
  }

  // Mixed case: extract IDs
  const result: string[] = new Array(capabilities.length);
  for (let i = 0; i < capabilities.length; i++) {
    const cap = capabilities[i];
    if (typeof cap === "string") {
      result[i] = cap;
    } else if (typeof cap === "object" && cap !== null) {
      result[i] = cap.id || cap;
    } else {
      result[i] = String(cap);
    }
  }
  return result;
}

/**
 * ULTRA-FAST capability extraction for middleware
 * Assumes capabilities are already in the correct format (pre-validated)
 *
 * @param capabilities - Array of capabilities (strings or objects)
 * @returns Array of capability ID strings
 */
export function extractCapabilityIdsFast(capabilities: any[]): string[] {
  if (capabilities.length === 0) return [];

  // For pre-validated data, we can be more aggressive
  const result: string[] = new Array(capabilities.length);
  for (let i = 0; i < capabilities.length; i++) {
    const cap = capabilities[i];
    result[i] = typeof cap === "string" ? cap : cap.id || cap;
  }
  return result;
}
