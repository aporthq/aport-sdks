"use strict";
/**
 * MCP Enforcement SDK for Agent Passport
 *
 * Provides framework-agnostic MCP (Model Context Protocol) enforcement
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractMCPHeaders = extractMCPHeaders;
exports.policyRequiresMCPEnforcement = policyRequiresMCPEnforcement;
exports.agentHasMCPCapabilities = agentHasMCPCapabilities;
exports.validateMCPHeaders = validateMCPHeaders;
exports.checkMCPEnforcement = checkMCPEnforcement;
exports.canUseMCPServer = canUseMCPServer;
exports.canUseMCPTool = canUseMCPTool;
/**
 * Default MCP enforcement configuration
 */
const DEFAULT_CONFIG = {
    enabled: true,
    strictMode: true,
    logViolations: true,
    requireMCP: false,
    allowedServers: [],
    allowedTools: [],
};
/**
 * Extract MCP headers from context
 */
function extractMCPHeaders(context) {
    const headers = context.headers || {};
    return {
        server: headers["x-mcp-server"],
        tool: headers["x-mcp-tool"],
        version: headers["x-mcp-version"],
    };
}
/**
 * Check if a policy requires MCP enforcement
 */
function policyRequiresMCPEnforcement(policy) {
    if (!policy || !policy.enforcement) {
        return false;
    }
    // Check if policy has MCP-specific enforcement rules
    const enforcement = policy.enforcement;
    return (enforcement.mcp_required === true ||
        enforcement.mcp_server_required === true ||
        enforcement.mcp_tool_required === true ||
        (enforcement.mcp_servers && enforcement.mcp_servers.length > 0) ||
        (enforcement.mcp_tools && enforcement.mcp_tools.length > 0));
}
/**
 * Check if agent has MCP capabilities
 */
function agentHasMCPCapabilities(agent) {
    if (!agent || !agent.mcp) {
        return false;
    }
    return (agent.mcp.enabled === true &&
        agent.mcp.servers &&
        agent.mcp.servers.length > 0);
}
/**
 * Validate MCP headers
 */
function validateMCPHeaders(headers, config = {}) {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    const violations = [];
    if (finalConfig.requireMCP && !headers.server) {
        violations.push("MCP server header is required");
    }
    if (finalConfig.allowedServers && finalConfig.allowedServers.length > 0) {
        if (!headers.server ||
            !finalConfig.allowedServers.includes(headers.server)) {
            violations.push(`MCP server ${headers.server} is not in allowed servers: ${finalConfig.allowedServers.join(", ")}`);
        }
    }
    if (finalConfig.allowedTools && finalConfig.allowedTools.length > 0) {
        if (!headers.tool || !finalConfig.allowedTools.includes(headers.tool)) {
            violations.push(`MCP tool ${headers.tool} is not in allowed tools: ${finalConfig.allowedTools.join(", ")}`);
        }
    }
    return {
        valid: violations.length === 0,
        violations,
    };
}
/**
 * Check MCP enforcement for an agent
 */
function checkMCPEnforcement(agent, context, config = {}) {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    if (!finalConfig.enabled) {
        return {
            allowed: true,
            violations: [],
            mcpHeaders: {},
            requiresMCP: false,
        };
    }
    const violations = [];
    const mcpHeaders = extractMCPHeaders(context);
    const requiresMCP = policyRequiresMCPEnforcement(agent?.policy) ||
        finalConfig.requireMCP ||
        false;
    if (requiresMCP) {
        if (!agentHasMCPCapabilities(agent)) {
            violations.push({
                type: "no_mcp_capabilities",
                reason: "Agent does not have MCP capabilities",
            });
        }
        const headerValidation = validateMCPHeaders(mcpHeaders, finalConfig);
        if (!headerValidation.valid) {
            violations.push({
                type: "invalid_mcp_headers",
                reason: headerValidation.violations.join(", "),
            });
        }
    }
    return {
        allowed: violations.length === 0,
        violations,
        mcpHeaders,
        requiresMCP,
    };
}
/**
 * Check if agent can use MCP server
 */
function canUseMCPServer(agent, server, config = {}) {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    if (!finalConfig.enabled) {
        return true;
    }
    if (!agentHasMCPCapabilities(agent)) {
        return false;
    }
    if (finalConfig.allowedServers && finalConfig.allowedServers.length > 0) {
        return finalConfig.allowedServers.includes(server);
    }
    return true;
}
/**
 * Check if agent can use MCP tool
 */
function canUseMCPTool(agent, tool, config = {}) {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    if (!finalConfig.enabled) {
        return true;
    }
    if (!agentHasMCPCapabilities(agent)) {
        return false;
    }
    if (finalConfig.allowedTools && finalConfig.allowedTools.length > 0) {
        return finalConfig.allowedTools.includes(tool);
    }
    return true;
}
//# sourceMappingURL=mcp-enforcement.js.map