/**
 * MCP Enforcement SDK for Agent Passport
 *
 * Provides framework-agnostic MCP (Model Context Protocol) enforcement
 */
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
    strictMode: boolean;
    logViolations: boolean;
    requireMCP?: boolean;
    allowedServers?: string[];
    allowedTools?: string[];
}
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
export declare function extractMCPHeaders(context: MCPContext): MCPHeaders;
/**
 * Check if a policy requires MCP enforcement
 */
export declare function policyRequiresMCPEnforcement(policy: any): boolean;
/**
 * Check if agent has MCP capabilities
 */
export declare function agentHasMCPCapabilities(agent: any): boolean;
/**
 * Validate MCP headers
 */
export declare function validateMCPHeaders(headers: MCPHeaders, config?: Partial<MCPEnforcementConfig>): {
    valid: boolean;
    violations: string[];
};
/**
 * Check MCP enforcement for an agent
 */
export declare function checkMCPEnforcement(agent: any, context: MCPContext, config?: Partial<MCPEnforcementConfig>): MCPEnforcementResult;
/**
 * Check if agent can use MCP server
 */
export declare function canUseMCPServer(agent: any, server: string, config?: Partial<MCPEnforcementConfig>): boolean;
/**
 * Check if agent can use MCP tool
 */
export declare function canUseMCPTool(agent: any, tool: string, config?: Partial<MCPEnforcementConfig>): boolean;
//# sourceMappingURL=mcp-enforcement.d.ts.map