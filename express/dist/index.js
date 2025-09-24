"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentPassportError = void 0;
exports.agentPassportMiddleware = agentPassportMiddleware;
exports.hasAgentPermission = hasAgentPermission;
exports.isAgentAllowedInRegion = isAgentAllowedInRegion;
exports.getAgent = getAgent;
exports.hasAgent = hasAgent;
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
// Simple client implementation
class AgentPassportClient {
  constructor(options) {
    this.options = options;
  }
  async verifyAgentPassport(agentId) {
    const response = await fetch(
      `${this.options.baseUrl}/api/verify/${encodeURIComponent(agentId)}`,
      {
        headers: {
          "Cache-Control": "public, max-age=60",
        },
      }
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new AgentPassportError(
        errorData.message || `HTTP ${response.status}: ${response.statusText}`,
        errorData.error || "verification_failed",
        response.status,
        agentId
      );
    }
    const data = await response.json();
    if (data.status !== "active") {
      throw new AgentPassportError(
        `Agent is ${data.status}`,
        `agent_${data.status}`,
        403,
        agentId
      );
    }
    return data;
  }
  hasPermission(agent, permission) {
    return agent.permissions.includes(permission);
  }
  isAllowedInRegion(agent, region) {
    return agent.regions.includes(region);
  }
}
const DEFAULT_OPTIONS = {
  baseUrl:
    process.env.AGENT_PASSPORT_BASE_URL || "https://passport-registry.com",
  timeout: 5000,
  cache: true,
  failClosed: true,
  requiredPermissions: [],
  allowedRegions: [],
  skipPaths: [],
  skipMethods: ["OPTIONS"],
};
/**
 * Express.js middleware for Agent Passport verification
 * @param options - Middleware configuration options
 * @returns Express middleware function
 */
function agentPassportMiddleware(options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const client = new AgentPassportClient({
    baseUrl: config.baseUrl,
    timeout: config.timeout,
    cache: config.cache,
  });
  return async (req, res, next) => {
    try {
      // Skip middleware for certain paths and methods
      if (shouldSkipRequest(req, config)) {
        return next();
      }
      // Extract agent ID from header
      const agentId = req.headers["x-agent-passport-id"];
      if (!agentId) {
        if (config.failClosed) {
          return res.status(400).json({
            error: "missing_agent_id",
            message: "X-Agent-Passport-Id header is required",
          });
        }
        return next();
      }
      // Verify agent passport
      const agent = await client.verifyAgentPassport(agentId);
      // Check required permissions
      if (config.requiredPermissions.length > 0) {
        const hasAllPermissions = config.requiredPermissions.every(
          (permission) => client.hasPermission(agent, permission)
        );
        if (!hasAllPermissions) {
          return res.status(403).json({
            error: "insufficient_permissions",
            message: "Agent does not have required permissions",
            required: config.requiredPermissions,
            current: agent.permissions,
          });
        }
      }
      // Check allowed regions
      if (config.allowedRegions.length > 0) {
        const isAllowedInAnyRegion = config.allowedRegions.some((region) =>
          client.isAllowedInRegion(agent, region)
        );
        if (!isAllowedInAnyRegion) {
          return res.status(403).json({
            error: "region_not_allowed",
            message: "Agent is not allowed in this region",
            allowed: config.allowedRegions,
            current: agent.regions,
          });
        }
      }
      // Attach agent to request
      req.agent = agent;
      next();
    } catch (error) {
      if (error instanceof AgentPassportError) {
        return res.status(error.statusCode || 500).json({
          error: error.code,
          message: error.message,
          agent_id: error.agentId,
        });
      }
      // Handle unexpected errors
      console.error("Agent Passport middleware error:", error);
      return res.status(500).json({
        error: "internal_error",
        message: "Internal server error",
      });
    }
  };
}
/**
 * Check if request should be skipped
 */
function shouldSkipRequest(req, config) {
  // Skip certain HTTP methods
  if (config.skipMethods.includes(req.method)) {
    return true;
  }
  // Skip certain paths
  if (config.skipPaths.some((path) => req.path.startsWith(path))) {
    return true;
  }
  return false;
}
/**
 * Helper function to check if agent has permission
 * @param req - Express request object
 * @param permission - Permission to check
 * @returns True if agent has permission
 */
function hasAgentPermission(req, permission) {
  if (!req.agent) {
    return false;
  }
  const client = new AgentPassportClient({
    baseUrl: "",
    timeout: 5000,
    cache: true,
  });
  return client.hasPermission(req.agent, permission);
}
/**
 * Helper function to check if agent is allowed in region
 * @param req - Express request object
 * @param region - Region to check
 * @returns True if agent is allowed in region
 */
function isAgentAllowedInRegion(req, region) {
  if (!req.agent) {
    return false;
  }
  const client = new AgentPassportClient({
    baseUrl: "",
    timeout: 5000,
    cache: true,
  });
  return client.isAllowedInRegion(req.agent, region);
}
/**
 * Helper function to get agent from request
 * @param req - Express request object
 * @returns Agent passport data or undefined
 */
function getAgent(req) {
  return req.agent;
}
/**
 * Helper function to check if request has agent
 * @param req - Express request object
 * @returns True if request has agent
 */
function hasAgent(req) {
  return !!req.agent;
}
//# sourceMappingURL=index.js.map
