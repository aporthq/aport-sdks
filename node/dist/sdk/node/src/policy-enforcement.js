"use strict";
// Framework-agnostic policy enforcement
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPolicy = verifyPolicy;
exports.hasPolicyAccess = hasPolicyAccess;
exports.getPolicy = getPolicy;
exports.getPolicyResult = getPolicyResult;
const DEFAULT_CONFIG = {
    apiBaseUrl: process.env.APORT_API_BASE_URL || "https://api.aport.io",
    failClosed: true,
    cacheTtl: 60,
    enabled: true,
    strictMode: true,
    logViolations: true,
};
// Global cache for policy packs and verification results
const _policyCache = {};
const _verificationCache = {};
/**
 * Fetch policy pack from API
 */
async function fetchPolicyPack(policyId, config) {
    try {
        const cacheKey = `policy:${policyId}`;
        const cached = _policyCache[cacheKey];
        if (cached && Date.now() - cached.timestamp < config.cacheTtl * 1000) {
            return cached.data;
        }
        const response = await fetch(`${config.apiBaseUrl}/api/policies/${policyId}`, {
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "AgentPassportSDK/1.0",
            },
        });
        if (!response.ok) {
            console.error(`Failed to fetch policy pack: ${response.status}`);
            return null;
        }
        const policyPack = (await response.json());
        // Cache the result
        _policyCache[cacheKey] = {
            data: policyPack,
            timestamp: Date.now(),
        };
        return policyPack;
    }
    catch (error) {
        console.error("Error fetching policy pack:", error);
        return null;
    }
}
/**
 * Verify policy compliance using server-side verification
 */
async function verifyPolicyCompliance(agentId, policyId, context, config) {
    try {
        const cacheKey = `${agentId}:${policyId}:${JSON.stringify(context)}`;
        const cached = _verificationCache[cacheKey];
        if (cached && Date.now() - cached.timestamp < config.cacheTtl * 1000) {
            return cached.data;
        }
        const response = await fetch(`${config.apiBaseUrl}/api/policies/${policyId}/verify`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "AgentPassportSDK/1.0",
            },
            body: JSON.stringify({
                agent_id: agentId,
                context: context,
            }),
        });
        if (!response.ok) {
            console.error(`Policy verification failed: ${response.status}`);
            return null;
        }
        const result = (await response.json());
        // Cache the result
        _verificationCache[cacheKey] = {
            data: result,
            timestamp: Date.now(),
        };
        return result;
    }
    catch (error) {
        console.error("Error verifying policy compliance:", error);
        return null;
    }
}
/**
 * Core policy verification function (framework-agnostic)
 */
async function verifyPolicy(agentId, policyId, context = {}, config = {}) {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    if (!finalConfig.enabled) {
        return { allowed: true };
    }
    try {
        // Verify policy compliance using server-side verification
        const policyResponse = await verifyPolicyCompliance(agentId, policyId, context, finalConfig);
        if (!policyResponse) {
            if (finalConfig.failClosed) {
                return {
                    allowed: false,
                    error: {
                        code: "policy_verification_failed",
                        message: "Failed to verify policy compliance",
                    },
                };
            }
            else {
                console.warn("Policy verification failed, allowing request to proceed");
                return { allowed: true };
            }
        }
        const result = {
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
    }
    catch (error) {
        console.error("Policy verification error:", error);
        if (finalConfig.failClosed) {
            return {
                allowed: false,
                error: {
                    code: "policy_verification_error",
                    message: "Internal policy verification error",
                },
            };
        }
        else {
            console.warn("Policy verification error, allowing request to proceed");
            return { allowed: true };
        }
    }
}
/**
 * Check if agent has policy access
 */
async function hasPolicyAccess(agentId, policyId, context = {}, config = {}) {
    const result = await verifyPolicy(agentId, policyId, context, config);
    return result.allowed;
}
/**
 * Get policy pack information
 */
async function getPolicy(policyId, config = {}) {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    return await fetchPolicyPack(policyId, finalConfig);
}
/**
 * Get policy result from a previous verification
 */
function getPolicyResult(result) {
    return result?.policyResult || null;
}
//# sourceMappingURL=policy-enforcement.js.map