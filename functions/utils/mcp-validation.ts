/**
 * MCP (Model Context Protocol) Validation Utilities
 *
 * Validates MCP servers and tools according to the specification:
 * - Servers: URLs (https://) or URNs (urn:mcp:*)
 * - Tools: namespace.action format (e.g., "stripe.refunds.create")
 */

export interface MCPConfig {
  servers?: string[];
  tools?: string[];
}

export interface MCPValidationResult {
  valid: boolean;
  errors: string[];
  sanitized?: MCPConfig;
}

// Constants for validation limits
export const MCP_LIMITS = {
  MAX_SERVERS: 50,
  MAX_TOOLS: 200,
} as const;

/**
 * Validate MCP server URL or URN
 */
export function validateMCPServer(server: string): {
  valid: boolean;
  error?: string;
} {
  if (!server || typeof server !== "string") {
    return { valid: false, error: "Server must be a non-empty string" };
  }

  // Trim whitespace
  server = server.trim();

  if (server.length === 0) {
    return { valid: false, error: "Server cannot be empty" };
  }

  // Check for URL format (https:// only for security)
  if (server.startsWith("https://")) {
    try {
      const url = new URL(server);
      if (url.protocol !== "https:") {
        return { valid: false, error: "Server URLs must use HTTPS protocol" };
      }
      if (!url.hostname) {
        return { valid: false, error: "Server URL must have a valid hostname" };
      }
      return { valid: true };
    } catch (error) {
      return { valid: false, error: "Invalid server URL format" };
    }
  }

  // Check for URN format (urn:mcp:*)
  if (server.startsWith("urn:mcp:")) {
    // URN format: urn:mcp:namespace:identifier
    const urnParts = server.split(":");
    if (urnParts.length < 4) {
      return {
        valid: false,
        error: "MCP URN must have format urn:mcp:namespace:identifier",
      };
    }

    // Validate namespace and identifier contain only allowed characters
    const namespace = urnParts[2];
    const identifier = urnParts.slice(3).join(":"); // Allow colons in identifier

    if (!/^[a-zA-Z0-9_-]+$/.test(namespace)) {
      return {
        valid: false,
        error:
          "MCP URN namespace must contain only alphanumeric characters, hyphens, and underscores",
      };
    }

    if (!/^[a-zA-Z0-9_:-]+$/.test(identifier)) {
      return {
        valid: false,
        error:
          "MCP URN identifier must contain only alphanumeric characters, hyphens, underscores, and colons",
      };
    }

    return { valid: true };
  }

  return {
    valid: false,
    error: "Server must be an HTTPS URL or MCP URN (urn:mcp:*)",
  };
}

/**
 * Validate MCP tool in namespace.action format
 */
export function validateMCPTool(tool: string): {
  valid: boolean;
  error?: string;
} {
  if (!tool || typeof tool !== "string") {
    return { valid: false, error: "Tool must be a non-empty string" };
  }

  // Trim whitespace
  tool = tool.trim();

  if (tool.length === 0) {
    return { valid: false, error: "Tool cannot be empty" };
  }

  // Check for namespace.action.method format (at least 3 parts)
  const parts = tool.split(".");
  if (parts.length < 3) {
    return {
      valid: false,
      error:
        'Tool must have format namespace.action.method (e.g., "stripe.refunds.create")',
    };
  }

  // Validate each part contains only allowed characters
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!/^[a-zA-Z0-9_-]+$/.test(part)) {
      return {
        valid: false,
        error: `Tool part "${part}" must contain only alphanumeric characters, hyphens, and underscores`,
      };
    }
  }

  return { valid: true };
}

/**
 * Validate complete MCP configuration
 */
export function validateMCPConfig(
  mcp: MCPConfig | undefined | null
): MCPValidationResult {
  const errors: string[] = [];
  const sanitized: MCPConfig = {};

  // If no MCP config provided, that's valid (optional field)
  if (!mcp) {
    return { valid: true, errors: [], sanitized: undefined };
  }

  // Validate servers
  if (mcp.servers !== undefined) {
    if (!Array.isArray(mcp.servers)) {
      errors.push("MCP servers must be an array");
    } else {
      if (mcp.servers.length > MCP_LIMITS.MAX_SERVERS) {
        errors.push(
          `MCP servers cannot exceed ${MCP_LIMITS.MAX_SERVERS} entries`
        );
      }

      const validServers: string[] = [];
      for (let i = 0; i < mcp.servers.length; i++) {
        const serverResult = validateMCPServer(mcp.servers[i]);
        if (!serverResult.valid) {
          errors.push(`Server ${i + 1}: ${serverResult.error}`);
        } else {
          const trimmed = mcp.servers[i].trim();
          if (!validServers.includes(trimmed)) {
            validServers.push(trimmed);
          }
        }
      }

      if (validServers.length > 0) {
        sanitized.servers = validServers;
      }
    }
  }

  // Validate tools
  if (mcp.tools !== undefined) {
    if (!Array.isArray(mcp.tools)) {
      errors.push("MCP tools must be an array");
    } else {
      if (mcp.tools.length > MCP_LIMITS.MAX_TOOLS) {
        errors.push(`MCP tools cannot exceed ${MCP_LIMITS.MAX_TOOLS} entries`);
      }

      const validTools: string[] = [];
      for (let i = 0; i < mcp.tools.length; i++) {
        const toolResult = validateMCPTool(mcp.tools[i]);
        if (!toolResult.valid) {
          errors.push(`Tool ${i + 1}: ${toolResult.error}`);
        } else {
          const trimmed = mcp.tools[i].trim();
          if (!validTools.includes(trimmed)) {
            validTools.push(trimmed);
          }
        }
      }

      if (validTools.length > 0) {
        sanitized.tools = validTools;
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized: Object.keys(sanitized).length > 0 ? sanitized : undefined,
  };
}

/**
 * Check if a passport is MCP-ready (has MCP configuration)
 */
export function isMCPReady(mcp: MCPConfig | undefined | null): boolean {
  return !!(
    mcp &&
    ((mcp.servers && mcp.servers.length > 0) ||
      (mcp.tools && mcp.tools.length > 0))
  );
}

/**
 * Get MCP summary for display purposes
 */
export function getMCPSummary(mcp: MCPConfig | undefined | null): {
  ready: boolean;
  serverCount: number;
  toolCount: number;
  servers: string[];
  tools: string[];
} {
  return {
    ready: isMCPReady(mcp),
    serverCount: mcp?.servers?.length || 0,
    toolCount: mcp?.tools?.length || 0,
    servers: mcp?.servers || [],
    tools: mcp?.tools || [],
  };
}
