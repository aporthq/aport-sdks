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
    capabilities: Array<{
        id: string;
    }>;
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
/**
 * Core policy verification function (framework-agnostic)
 */
export declare function verifyPolicy(agentId: string, policyId: string, context?: any, config?: Partial<PolicyEnforcementConfig>): Promise<{
    allowed: boolean;
    result?: PolicyResult;
    error?: {
        code: string;
        message: string;
        violations?: string[];
    };
}>;
/**
 * Check if agent has policy access
 */
export declare function hasPolicyAccess(agentId: string, policyId: string, context?: any, config?: Partial<PolicyEnforcementConfig>): Promise<boolean>;
/**
 * Get policy pack information
 */
export declare function getPolicy(policyId: string, config?: Partial<PolicyEnforcementConfig>): Promise<PolicyPack | null>;
/**
 * Get policy result from a previous verification
 */
export declare function getPolicyResult(result: any): PolicyResult | null;
export type { PolicyPack, PassportData, PolicyVerifyResponse, PolicyResult, PolicyEnforcementConfig, };
//# sourceMappingURL=policy-enforcement.d.ts.map