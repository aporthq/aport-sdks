/**
 * MCP Enforcement for Policy Verification
 *
 * Provides MCP (Model Context Protocol) checking for policy verification using
 * the robust MCP validation utilities from the main functions/utils directory.
 */

import { PassportData } from "../../../types/passport";
import { DecisionReason } from "../../../shared/types/decision";
import { validateMCPConfig } from "../mcp-validation";

export async function evaluateMCP(
  passport: PassportData,
  policyPack: any,
  context: Record<string, any>
): Promise<{ allow: boolean; reasons: DecisionReason[] }> {
  const reasons: DecisionReason[] = [];

  // Check if policy has MCP requirements
  if (!policyPack.mcp) {
    return { allow: true, reasons };
  }

  const allowedServers = policyPack.mcp.servers || [];
  const allowedTools = policyPack.mcp.tools || [];

  // Validate MCP configuration using robust utility
  const mcpConfig = {
    servers: passport.mcp?.servers || [],
    tools: passport.mcp?.tools || [],
  };

  const validationResult = validateMCPConfig(mcpConfig);
  if (!validationResult.valid) {
    reasons.push({
      code: "INVALID_MCP_CONFIG",
      message: `Invalid MCP configuration: ${validationResult.errors.join(
        ", "
      )}`,
      severity: "error",
    });
    return { allow: false, reasons };
  }

  // Check MCP servers
  if (allowedServers.length > 0) {
    const mcpServers = passport.mcp?.servers || [];
    const hasAllowedServer = allowedServers.some((server: string) =>
      mcpServers.includes(server)
    );

    if (!hasAllowedServer) {
      reasons.push({
        code: "MCP_SERVER_NOT_ALLOWED",
        message: `Agent must have one of these MCP servers: ${allowedServers.join(
          ", "
        )}`,
        severity: "error",
      });
      return { allow: false, reasons };
    }
  }

  // Check MCP tools
  if (allowedTools.length > 0) {
    const mcpTools = passport.mcp?.tools || [];
    const hasAllowedTool = allowedTools.some((tool: string) =>
      mcpTools.includes(tool)
    );

    if (!hasAllowedTool) {
      reasons.push({
        code: "MCP_TOOL_NOT_ALLOWED",
        message: `Agent must have one of these MCP tools: ${allowedTools.join(
          ", "
        )}`,
        severity: "error",
      });
      return { allow: false, reasons };
    }
  }

  return { allow: true, reasons };
}
