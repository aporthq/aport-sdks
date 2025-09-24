/**
 * MCP Enforcement SDK for Agent Passport
 *
 * Provides framework-agnostic MCP (Model Context Protocol) enforcement
 */

import { PassportData } from "../../../types/passport";

/**
 * MCP Headers extracted from HTTP request
 */
export interface MCPHeaders {
  server?: string;
  tool?: string;
  version?: string;
}

/**
 * MCP enforcement context
 */
export interface MCPContext {
  path?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
}

/**
 * MCP enforcement configuration
 */
export interface MCPEnforcementConfig {
  enabled: boolean;
  strictMode: boolean; // If true, reject requests that don't meet MCP requirements
  logViolations: boolean; // Log MCP violations for monitoring
  requireMCP?: boolean; // Force MCP requirement
  allowedServers?: string[]; // Allowed MCP servers
  allowedTools?: string[]; // Allowed MCP tools
}

/**
 * Default MCP enforcement configuration
 */
const DEFAULT_CONFIG: MCPEnforcementConfig = {
  enabled: true,
  strictMode: true,
  logViolations: true,
  requireMCP: false,
  allowedServers: [],
  allowedTools: [],
};

/**
 * MCP enforcement result
 */
export interface MCPEnforcementResult {
  allowed: boolean;
  violations: Array<{
    type: string;
    reason: string;
    server?: string;
    tool?: string;
  }>;
  mcpHeaders: MCPHeaders;
  requiresMCP: boolean;
}

/**
 * Extract MCP headers from context
 */
export function extractMCPHeaders(context: MCPContext): MCPHeaders {
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
export function policyRequiresMCPEnforcement(policy: any): boolean {
  if (!policy || !policy.enforcement) {
    return false;
  }

  // Check if policy has MCP-specific enforcement rules
  const enforcement = policy.enforcement;
  return (
    enforcement.mcp_required === true ||
    enforcement.mcp_server_required === true ||
    enforcement.mcp_tool_required === true ||
    (enforcement.mcp_servers && enforcement.mcp_servers.length > 0) ||
    (enforcement.mcp_tools && enforcement.mcp_tools.length > 0)
  );
}

/**
 * Check if agent has MCP capabilities
 */
export function agentHasMCPCapabilities(agent: any): boolean {
  if (!agent || !agent.mcp) {
    return false;
  }

  return (
    agent.mcp.enabled === true &&
    agent.mcp.servers &&
    agent.mcp.servers.length > 0
  );
}

/**
 * Validate MCP headers
 */
export function validateMCPHeaders(
  headers: MCPHeaders,
  config: Partial<MCPEnforcementConfig> = {}
): {
  valid: boolean;
  violations: string[];
} {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const violations: string[] = [];

  if (finalConfig.requireMCP && !headers.server) {
    violations.push("MCP server header is required");
  }

  if (finalConfig.allowedServers && finalConfig.allowedServers.length > 0) {
    if (
      !headers.server ||
      !finalConfig.allowedServers.includes(headers.server)
    ) {
      violations.push(
        `MCP server ${
          headers.server
        } is not in allowed servers: ${finalConfig.allowedServers.join(", ")}`
      );
    }
  }

  if (finalConfig.allowedTools && finalConfig.allowedTools.length > 0) {
    if (!headers.tool || !finalConfig.allowedTools.includes(headers.tool)) {
      violations.push(
        `MCP tool ${
          headers.tool
        } is not in allowed tools: ${finalConfig.allowedTools.join(", ")}`
      );
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
export function checkMCPEnforcement(
  agent: any,
  context: MCPContext,
  config: Partial<MCPEnforcementConfig> = {}
): MCPEnforcementResult {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  if (!finalConfig.enabled) {
    return {
      allowed: true,
      violations: [],
      mcpHeaders: {},
      requiresMCP: false,
    };
  }

  const violations: Array<{
    type: string;
    reason: string;
    server?: string;
    tool?: string;
  }> = [];

  const mcpHeaders = extractMCPHeaders(context);
  const requiresMCP =
    policyRequiresMCPEnforcement(agent?.policy) ||
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
export function canUseMCPServer(
  agent: any,
  server: string,
  config: Partial<MCPEnforcementConfig> = {}
): boolean {
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
export function canUseMCPTool(
  agent: any,
  tool: string,
  config: Partial<MCPEnforcementConfig> = {}
): boolean {
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
