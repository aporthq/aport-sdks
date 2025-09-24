"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPolicy = exports.hasPolicyAccess = exports.getPolicyResult = exports.getPolicy = exports.AgentPassportError = void 0;
exports.withAgentPassportId = withAgentPassportId;
exports.verifyAgentPassport = verifyAgentPassport;
exports.hasCapability = hasCapability;
exports.isAllowedInRegion = isAllowedInRegion;
exports.getAgentPassportId = getAgentPassportId;
exports.withAgentPassportIdFromEnv = withAgentPassportIdFromEnv;
const node_fetch_1 = __importDefault(require("node-fetch"));
class AgentPassportError extends Error {
    constructor(message, code, statusCode, agentId) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.agentId = agentId;
        this.name = "AgentPassportError";
    }
}
exports.AgentPassportError = AgentPassportError;
/**
 * Wraps a fetch function to automatically include the X-Agent-Passport-Id header
 * @param agentId - The agent passport ID
 * @param fetchFn - The fetch function to wrap (defaults to global fetch)
 * @returns A wrapped fetch function that includes the agent passport header
 */
function withAgentPassportId(agentId, fetchFn = node_fetch_1.default) {
    return async (input, init) => {
        const headers = {
            ...(init?.headers || {}),
            "X-Agent-Passport-Id": agentId,
        };
        return fetchFn(input, {
            ...init,
            headers,
        });
    };
}
/**
 * Verifies an agent passport ID against the registry
 * @param agentId - The agent passport ID to verify
 * @param options - Verification options
 * @returns Promise resolving to the agent passport data
 */
async function verifyAgentPassport(agentId, options = {}) {
    const { baseUrl = process.env.AGENT_PASSPORT_BASE_URL ||
        "https://passport-registry.com", cache = true, timeout = 5000, } = options;
    const url = `${baseUrl}/api/verify/${encodeURIComponent(agentId)}`;
    const headers = {};
    if (cache) {
        // Add cache headers for better performance
        headers["Cache-Control"] = "public, max-age=60";
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await global.fetch(url, {
            headers,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (response.status === 304) {
            // Cache hit - return cached data (in real implementation, this would come from cache)
            throw new AgentPassportError("Agent passport verification failed - cache hit but no cached data available", "cache_error", 304, agentId);
        }
        if (!response.ok) {
            const errorData = (await response.json().catch(() => ({})));
            throw new AgentPassportError(errorData.message || `HTTP ${response.status}: ${response.statusText}`, errorData.error || "verification_failed", response.status, agentId);
        }
        const data = (await response.json());
        if (data.status !== "active") {
            throw new AgentPassportError(`Agent is ${data.status}`, `agent_${data.status}`, 403, agentId);
        }
        return data;
    }
    catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof AgentPassportError) {
            throw error;
        }
        if (error.name === "AbortError") {
            throw new AgentPassportError("Verification request timed out", "timeout", 408, agentId);
        }
        throw new AgentPassportError(error instanceof Error ? error.message : "Unknown error occurred", "network_error", 0, agentId);
    }
}
/**
 * Checks if an agent has a specific permission
 * @param agent - The agent passport data
 * @param capability - The capability to check
 * @returns True if the agent has the permission
 */
function hasCapability(agent, capability) {
    return agent.capabilities?.map((cap) => cap.id).includes(capability) || false;
}
/**
 * Checks if an agent is allowed in a specific region
 * @param agent - The agent passport data
 * @param region - The region to check
 * @returns True if the agent is allowed in the region
 */
function isAllowedInRegion(agent, region) {
    return agent.regions.includes(region);
}
/**
 * Gets the current agent passport ID from environment variables
 * @returns The agent passport ID or undefined if not set
 */
function getAgentPassportId() {
    return process.env.AGENT_PASSPORT_ID;
}
/**
 * Creates a fetch function with the agent passport ID from environment variables
 * @param fetchFn - The fetch function to wrap (defaults to global fetch)
 * @returns A wrapped fetch function or undefined if AGENT_PASSPORT_ID is not set
 */
function withAgentPassportIdFromEnv(fetchFn = node_fetch_1.default) {
    const agentId = getAgentPassportId();
    return agentId ? withAgentPassportId(agentId, fetchFn) : undefined;
}
// Export all enforcement and validation modules
__exportStar(require("./assurance-enforcement"), exports);
__exportStar(require("./capability-enforcement"), exports);
__exportStar(require("./limits-enforcement"), exports);
__exportStar(require("./mcp-enforcement"), exports);
__exportStar(require("./region-validation"), exports);
__exportStar(require("./taxonomy-validation"), exports);
// Export policy enforcement functions
var policy_enforcement_1 = require("./policy-enforcement");
Object.defineProperty(exports, "getPolicy", { enumerable: true, get: function () { return policy_enforcement_1.getPolicy; } });
Object.defineProperty(exports, "getPolicyResult", { enumerable: true, get: function () { return policy_enforcement_1.getPolicyResult; } });
Object.defineProperty(exports, "hasPolicyAccess", { enumerable: true, get: function () { return policy_enforcement_1.hasPolicyAccess; } });
Object.defineProperty(exports, "verifyPolicy", { enumerable: true, get: function () { return policy_enforcement_1.verifyPolicy; } });
// Export refunds v1 helpers
__exportStar(require("./refunds"), exports);
//# sourceMappingURL=index.js.map