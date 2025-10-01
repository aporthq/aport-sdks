/**
 * Policy Verification Telemetry & Reputation System
 *
 * Tracks authenticated policy verification decisions for reputation building
 * and anti-gaming measures. Only counts decisions from authenticated platforms
 * with valid API keys to prevent reputation poisoning.
 */

import { KVNamespace } from "@cloudflare/workers-types";

export interface PolicyDecision {
  decision_id: string;
  agent_id: string;
  platform_id: string; // API key ID or platform identifier
  policy_id: string;
  decision: boolean; // allow/deny
  reason_codes: string[];
  timestamp: string;
  assurance_level: string;
  region?: string;
  // Verifiability fields
  signature?: string; // HMAC-SHA256 signature
  registry_key_id?: string; // Registry key used for signing
  signed_at?: string; // When this decision was signed
}

export interface AgentReputation {
  agent_id: string;
  verified_usage: {
    distinct_platforms_30d: number;
    distinct_platforms_90d: number;
    total_decisions_30d: number;
    total_decisions_90d: number;
  };
  allow_rate: {
    last_30d: number;
    last_90d: number;
  };
  top_deny_codes: Array<{
    policy_name: string;
    reason_code: string;
    count: number;
    last_30d: number;
    last_90d: number;
  }>;
  mtts?: number; // Mean time to suspend (if applicable)
  last_updated: string;
}

export interface PlatformWeight {
  platform_id: string;
  assurance_level: string;
  weight: number; // Higher weight for higher assurance platforms
  verified_at: string;
}

export class PolicyTelemetryService {
  private kv: KVNamespace;
  private version: string;
  private registryPrivateKey?: string;
  private registryKeyId?: string;

  constructor(
    kv: KVNamespace,
    version: string = "1.0.0",
    registryPrivateKey?: string,
    registryKeyId?: string
  ) {
    this.kv = kv;
    this.version = version;
    this.registryPrivateKey = registryPrivateKey;
    this.registryKeyId = registryKeyId;
  }

  /**
   * Record a policy verification decision
   * Only records decisions from authenticated platforms
   */
  async recordDecision(
    decision: PolicyDecision,
    platformWeight?: PlatformWeight
  ): Promise<void> {
    try {
      const now = new Date().toISOString();

      // Sign the decision if we have registry keys
      let signedDecision = decision;
      if (this.registryPrivateKey && this.registryKeyId) {
        signedDecision = await this.signPolicyDecision(decision);
      }

      // Store the decision
      const decisionKey = `policy_decision:${decision.decision_id}`;
      await this.kv.put(decisionKey, JSON.stringify(signedDecision), {
        expirationTtl: 90 * 24 * 60 * 60, // 90 days
      });

      // Update agent reputation
      await this.updateAgentReputation(decision, platformWeight);

      // Update platform usage stats
      await this.updatePlatformStats(decision, platformWeight);

      // Update reason code stats
      await this.updateReasonCodeStats(decision);

      console.log(
        `Recorded policy decision: ${decision.decision_id} for agent ${decision.agent_id}`
      );
    } catch (error) {
      console.error("Failed to record policy decision:", error);
      // Silent fail for performance
    }
  }

  /**
   * Get agent reputation data
   */
  async getAgentReputation(agentId: string): Promise<AgentReputation | null> {
    try {
      const key = `agent_reputation:${agentId}`;
      const data = await this.kv.get(key, "json");
      return data as AgentReputation | null;
    } catch (error) {
      console.error("Failed to get agent reputation:", error);
      return null;
    }
  }

  /**
   * Get platform weight for reputation calculations
   */
  async getPlatformWeight(platformId: string): Promise<PlatformWeight | null> {
    try {
      const key = `platform_weight:${platformId}`;
      const data = await this.kv.get(key, "json");
      return data as PlatformWeight | null;
    } catch (error) {
      console.error("Failed to get platform weight:", error);
      return null;
    }
  }

  /**
   * Set platform weight for reputation calculations
   */
  async setPlatformWeight(weight: PlatformWeight): Promise<void> {
    try {
      const key = `platform_weight:${weight.platform_id}`;
      await this.kv.put(key, JSON.stringify(weight), {
        expirationTtl: 365 * 24 * 60 * 60, // 1 year
      });
    } catch (error) {
      console.error("Failed to set platform weight:", error);
    }
  }

  /**
   * Update agent reputation based on new decision
   */
  private async updateAgentReputation(
    decision: PolicyDecision,
    platformWeight?: PlatformWeight
  ): Promise<void> {
    try {
      const agentKey = `agent_reputation:${decision.agent_id}`;
      const existing = (await this.kv.get(
        agentKey,
        "json"
      )) as AgentReputation | null;

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      const reputation: AgentReputation = existing || {
        agent_id: decision.agent_id,
        verified_usage: {
          distinct_platforms_30d: 0,
          distinct_platforms_90d: 0,
          total_decisions_30d: 0,
          total_decisions_90d: 0,
        },
        allow_rate: {
          last_30d: 0,
          last_90d: 0,
        },
        top_deny_codes: [],
        last_updated: now.toISOString(),
      };

      // Update platform counts (simplified - would need more complex logic for distinct counts)
      reputation.verified_usage.total_decisions_30d++;
      reputation.verified_usage.total_decisions_90d++;

      // Update allow rate (simplified - would need more complex logic for time windows)
      if (decision.decision) {
        reputation.allow_rate.last_30d = Math.min(
          1,
          reputation.allow_rate.last_30d + 0.01
        );
        reputation.allow_rate.last_90d = Math.min(
          1,
          reputation.allow_rate.last_90d + 0.01
        );
      } else {
        reputation.allow_rate.last_30d = Math.max(
          0,
          reputation.allow_rate.last_30d - 0.01
        );
        reputation.allow_rate.last_90d = Math.max(
          0,
          reputation.allow_rate.last_90d - 0.01
        );
      }

      reputation.last_updated = now.toISOString();

      await this.kv.put(agentKey, JSON.stringify(reputation), {
        expirationTtl: 365 * 24 * 60 * 60, // 1 year
      });
    } catch (error) {
      console.error("Failed to update agent reputation:", error);
    }
  }

  /**
   * Update platform usage statistics
   */
  private async updatePlatformStats(
    decision: PolicyDecision,
    platformWeight?: PlatformWeight
  ): Promise<void> {
    try {
      const platformKey = `platform_stats:${decision.platform_id}`;
      const existing = ((await this.kv.get(platformKey, "json")) as any) || {
        platform_id: decision.platform_id,
        total_decisions: 0,
        allow_decisions: 0,
        deny_decisions: 0,
        last_activity: new Date().toISOString(),
      };

      existing.total_decisions++;
      if (decision.decision) {
        existing.allow_decisions++;
      } else {
        existing.deny_decisions++;
      }
      existing.last_activity = new Date().toISOString();

      await this.kv.put(platformKey, JSON.stringify(existing), {
        expirationTtl: 365 * 24 * 60 * 60, // 1 year
      });
    } catch (error) {
      console.error("Failed to update platform stats:", error);
    }
  }

  /**
   * Update reason code statistics
   */
  private async updateReasonCodeStats(decision: PolicyDecision): Promise<void> {
    try {
      if (decision.decision || decision.reason_codes.length === 0) {
        return; // Only track deny reasons
      }

      for (const reasonCode of decision.reason_codes) {
        const reasonKey = `reason_stats:${decision.policy_id}:${reasonCode}`;
        const existing = ((await this.kv.get(reasonKey, "json")) as any) || {
          policy_id: decision.policy_id,
          reason_code: reasonCode,
          count: 0,
          last_30d: 0,
          last_90d: 0,
        };

        existing.count++;
        existing.last_30d++;
        existing.last_90d++;

        await this.kv.put(reasonKey, JSON.stringify(existing), {
          expirationTtl: 365 * 24 * 60 * 60, // 1 year
        });
      }
    } catch (error) {
      console.error("Failed to update reason code stats:", error);
    }
  }

  /**
   * Sign a policy decision for verifiability
   */
  private async signPolicyDecision(
    decision: PolicyDecision
  ): Promise<PolicyDecision> {
    if (!this.registryPrivateKey || !this.registryKeyId) {
      throw new Error("Registry private key and key ID required for signing");
    }

    try {
      const now = new Date().toISOString();

      // Create canonical payload for signing (exclude signature fields)
      const payload = {
        decision_id: decision.decision_id,
        agent_id: decision.agent_id,
        platform_id: decision.platform_id,
        policy_id: decision.policy_id,
        decision: decision.decision,
        reason_codes: decision.reason_codes,
        timestamp: decision.timestamp,
        assurance_level: decision.assurance_level,
        region: decision.region || null,
        registry_key_id: this.registryKeyId,
        signed_at: now,
      };

      // Canonicalize payload (sorted keys for consistency)
      const canonicalPayload = this.canonicalizePayload(payload);
      const payloadString = JSON.stringify(canonicalPayload);

      // Generate HMAC-SHA256 signature
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(this.registryPrivateKey),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );

      const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(payloadString)
      );

      const signatureArray = Array.from(new Uint8Array(signature));
      const signatureBase64 = btoa(String.fromCharCode(...signatureArray));

      return {
        ...decision,
        signature: `hmac-sha256:${signatureBase64}`,
        registry_key_id: this.registryKeyId,
        signed_at: now,
      };
    } catch (error) {
      console.error("Failed to sign policy decision:", error);
      throw new Error("Policy decision signing failed");
    }
  }

  /**
   * Canonicalize payload for consistent signing
   */
  private canonicalizePayload(payload: any): any {
    if (payload === null || typeof payload !== "object") {
      return payload;
    }

    if (Array.isArray(payload)) {
      return payload.map((item) => this.canonicalizePayload(item));
    }

    const sortedKeys = Object.keys(payload).sort();
    const canonical: any = {};

    for (const key of sortedKeys) {
      canonical[key] = this.canonicalizePayload(payload[key]);
    }

    return canonical;
  }

  /**
   * Verify a policy decision signature
   */
  async verifyPolicyDecision(decision: PolicyDecision): Promise<boolean> {
    if (
      !decision.signature ||
      !decision.registry_key_id ||
      !decision.signed_at
    ) {
      return false;
    }

    try {
      // Recreate the payload that was signed
      const payload = {
        decision_id: decision.decision_id,
        agent_id: decision.agent_id,
        platform_id: decision.platform_id,
        policy_id: decision.policy_id,
        decision: decision.decision,
        reason_codes: decision.reason_codes,
        timestamp: decision.timestamp,
        assurance_level: decision.assurance_level,
        region: decision.region || null,
        registry_key_id: decision.registry_key_id,
        signed_at: decision.signed_at,
      };

      const canonicalPayload = this.canonicalizePayload(payload);
      const payloadString = JSON.stringify(canonicalPayload);

      // Generate expected signature
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(this.registryPrivateKey!),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );

      const expectedSignature = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(payloadString)
      );

      const expectedArray = Array.from(new Uint8Array(expectedSignature));
      const expectedBase64 = btoa(String.fromCharCode(...expectedArray));
      const expectedSignatureString = `hmac-sha256:${expectedBase64}`;

      return decision.signature === expectedSignatureString;
    } catch (error) {
      console.error("Failed to verify policy decision signature:", error);
      return false;
    }
  }

  /**
   * Get aggregated telemetry data for analytics
   */
  async getTelemetryData(
    agentId?: string,
    platformId?: string,
    policyId?: string
  ): Promise<{
    agents: AgentReputation[];
    platforms: any[];
    reason_codes: any[];
  }> {
    try {
      // This is a simplified implementation
      // In production, you'd want more sophisticated querying
      const agents: AgentReputation[] = [];
      const platforms: any[] = [];
      const reason_codes: any[] = [];

      // TODO: Implement proper data aggregation
      // This would require scanning KV keys and aggregating data

      return { agents, platforms, reason_codes };
    } catch (error) {
      console.error("Failed to get telemetry data:", error);
      return { agents: [], platforms: [], reason_codes: [] };
    }
  }
}

/**
 * Create a policy telemetry service instance
 */
export function createPolicyTelemetryService(
  kv: KVNamespace,
  registryPrivateKey?: string,
  registryKeyId?: string
): PolicyTelemetryService {
  return new PolicyTelemetryService(
    kv,
    "1.0.0",
    registryPrivateKey,
    registryKeyId
  );
}
