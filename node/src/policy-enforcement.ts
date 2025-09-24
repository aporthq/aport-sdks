// Framework-agnostic policy enforcement

interface PolicyPack {
  id: string;
  name: string;
  requires_capabilities: string[];
  min_assurance: string;
  limits_required: string[];
  enforcement: Record<string, string>;
}

interface PassportData {
  agent_id: string;
  name: string;
  status: string;
  capabilities: Array<{ id: string }>;
  limits: Record<string, any>;
  regions: string[];
  assurance_level: string;
  assurance_method: string;
  assurance_verified_at: string;
}

interface PolicyVerifyResponse {
  allow: boolean;
  reason: string | null;
  violations: string[];
  passport: {
    agent_id: string;
    kind?: string;
    parent_agent_id?: string;
    status: string;
    assurance_level: string;
    capabilities: string[];
    limits: Record<string, any>;
    regions: string[];
    mcp?: any;
    attestations?: any[];
    evaluation?: {
      pack_id: string;
      assurance_ok: boolean;
      capability_ok: boolean;
      limits_ok: boolean;
      regions_ok: boolean;
      mcp_ok: boolean;
      reasons: string[];
    };
  };
}

interface PolicyResult {
  allowed: boolean;
  reason?: string;
  violations?: string[];
  agent_id?: string;
  policy_id?: string;
  evaluation?: any;
}

interface PolicyEnforcementConfig {
  apiBaseUrl: string;
  failClosed: boolean;
  cacheTtl: number;
  enabled: boolean;
  strictMode: boolean;
  logViolations: boolean;
}

const DEFAULT_CONFIG: PolicyEnforcementConfig = {
  apiBaseUrl: process.env.APORT_API_BASE_URL || "https://api.aport.io",
  failClosed: true,
  cacheTtl: 60,
  enabled: true,
  strictMode: true,
  logViolations: true,
};

// Global cache for policy packs and verification results
const _policyCache: Record<string, any> = {};
const _verificationCache: Record<string, any> = {};

/**
 * Fetch policy pack from API
 */
async function fetchPolicyPack(
  policyId: string,
  config: PolicyEnforcementConfig
): Promise<PolicyPack | null> {
  try {
    const cacheKey = `policy:${policyId}`;
    const cached = _policyCache[cacheKey];

    if (cached && Date.now() - cached.timestamp < config.cacheTtl * 1000) {
      return cached.data;
    }

    const response = await fetch(
      `${config.apiBaseUrl}/api/policies/${policyId}`,
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "AgentPassportSDK/1.0",
        },
      }
    );

    if (!response.ok) {
      console.error(`Failed to fetch policy pack: ${response.status}`);
      return null;
    }

    const policyPack = (await response.json()) as PolicyPack;

    // Cache the result
    _policyCache[cacheKey] = {
      data: policyPack,
      timestamp: Date.now(),
    };

    return policyPack;
  } catch (error) {
    console.error("Error fetching policy pack:", error);
    return null;
  }
}

/**
 * Verify policy compliance using server-side verification
 */
async function verifyPolicyCompliance(
  agentId: string,
  policyId: string,
  context: any,
  config: PolicyEnforcementConfig
): Promise<PolicyVerifyResponse | null> {
  try {
    const cacheKey = `${agentId}:${policyId}:${JSON.stringify(context)}`;
    const cached = _verificationCache[cacheKey];

    if (cached && Date.now() - cached.timestamp < config.cacheTtl * 1000) {
      return cached.data;
    }

    const response = await fetch(
      `${config.apiBaseUrl}/api/policies/${policyId}/verify`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "AgentPassportSDK/1.0",
        },
        body: JSON.stringify({
          agent_id: agentId,
          context: context,
        }),
      }
    );

    if (!response.ok) {
      console.error(`Policy verification failed: ${response.status}`);
      return null;
    }

    const result = (await response.json()) as PolicyVerifyResponse;

    // Cache the result
    _verificationCache[cacheKey] = {
      data: result,
      timestamp: Date.now(),
    };

    return result;
  } catch (error) {
    console.error("Error verifying policy compliance:", error);
    return null;
  }
}

/**
 * Core policy verification function (framework-agnostic)
 */
export async function verifyPolicy(
  agentId: string,
  policyId: string,
  context: any = {},
  config: Partial<PolicyEnforcementConfig> = {}
): Promise<{
  allowed: boolean;
  result?: PolicyResult;
  error?: {
    code: string;
    message: string;
    violations?: string[];
  };
}> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  if (!finalConfig.enabled) {
    return { allowed: true };
  }

  try {
    // Verify policy compliance using server-side verification
    const policyResponse = await verifyPolicyCompliance(
      agentId,
      policyId,
      context,
      finalConfig
    );

    if (!policyResponse) {
      if (finalConfig.failClosed) {
        return {
          allowed: false,
          error: {
            code: "policy_verification_failed",
            message: "Failed to verify policy compliance",
          },
        };
      } else {
        console.warn("Policy verification failed, allowing request to proceed");
        return { allowed: true };
      }
    }

    const result: PolicyResult = {
      allowed: policyResponse.allow,
      reason: policyResponse.reason || undefined,
      violations: policyResponse.violations || [],
      agent_id: agentId,
      policy_id: policyId,
      evaluation: policyResponse.passport?.evaluation,
    };

    if (!policyResponse.allow) {
      return {
        allowed: false,
        result,
        error: {
          code: "policy_violation",
          message: policyResponse.reason || "Policy violation",
          violations: policyResponse.violations || [],
        },
      };
    }

    return { allowed: true, result };
  } catch (error) {
    console.error("Policy verification error:", error);

    if (finalConfig.failClosed) {
      return {
        allowed: false,
        error: {
          code: "policy_verification_error",
          message: "Internal policy verification error",
        },
      };
    } else {
      console.warn("Policy verification error, allowing request to proceed");
      return { allowed: true };
    }
  }
}

/**
 * Check if agent has policy access
 */
export async function hasPolicyAccess(
  agentId: string,
  policyId: string,
  context: any = {},
  config: Partial<PolicyEnforcementConfig> = {}
): Promise<boolean> {
  const result = await verifyPolicy(agentId, policyId, context, config);
  return result.allowed;
}

/**
 * Get policy pack information
 */
export async function getPolicy(
  policyId: string,
  config: Partial<PolicyEnforcementConfig> = {}
): Promise<PolicyPack | null> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  return await fetchPolicyPack(policyId, finalConfig);
}

/**
 * Get policy result from a previous verification
 */
export function getPolicyResult(result: any): PolicyResult | null {
  return result?.policyResult || null;
}

// Export types for external use
export type {
  PolicyPack,
  PassportData,
  PolicyVerifyResponse,
  PolicyResult,
  PolicyEnforcementConfig,
};
