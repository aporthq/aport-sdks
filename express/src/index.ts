/**
 * Express Middleware for Agent Passport Registry
 *
 * This middleware provides framework-specific integration for Express.js
 * while delegating all business logic to the @aporthq/sdk-node package.
 */

import { Request, Response, NextFunction } from "express";
// Import from local SDK (adjust path as needed)
import {
  AgentPassport,
  AgentPassportError,
  verifyAgentPassport,
  verifyPolicy,
  hasPolicyAccess,
  getPolicy,
  getPolicyResult,
  checkAssuranceRequirements,
  checkLimits,
  isAllowedInRegion,
  validateTaxonomyForAgent,
  checkMCPEnforcement,
  checkCapabilities,
  createCapabilityEnforcer,
  AssuranceEnforcementConfig,
  CapabilityEnforcementConfig,
  LimitsEnforcementConfig,
  RegionValidationConfig,
  TaxonomyValidationConfig,
  MCPEnforcementConfig,
} from "../../../sdk/node/src";

// Extend Express Request type to include agent data
export interface AgentRequest extends Request {
  agent?: AgentPassport;
  limitChecker?: any;
  policyResult?: any;
}

// Re-export types from SDK
export type { AgentPassport, AgentPassportError };

/**
 * Middleware options
 */
export interface AgentPassportMiddlewareOptions {
  baseUrl?: string;
  timeout?: number;
  cache?: boolean;
  failClosed?: boolean;
  skipPaths?: string[];
  requiredPermissions?: string[];
  allowedRegions?: string[];

  // Enforcement configurations
  assurance?: AssuranceEnforcementConfig;
  capabilities?: CapabilityEnforcementConfig;
  limits?: LimitsEnforcementConfig;
  regions?: RegionValidationConfig;
  taxonomy?: TaxonomyValidationConfig;
  mcp?: MCPEnforcementConfig;
}

/**
 * Default middleware options
 */
const DEFAULT_OPTIONS: Required<AgentPassportMiddlewareOptions> = {
  baseUrl:
    process.env.AGENT_PASSPORT_BASE_URL || "https://passport-registry.com",
  timeout: 5000,
  cache: true,
  failClosed: true,
  skipPaths: ["/health", "/metrics", "/status"],
  requiredPermissions: [],
  allowedRegions: [],

  // Default enforcement configs
  assurance: {
    enabled: true,
    strictMode: true,
    logViolations: true,
  },
  capabilities: {
    enabled: true,
    enforceOnAllRoutes: true,
    skipRoutes: [],
    allowUnmappedRoutes: false,
    strictMode: true,
    logViolations: true,
  },
  limits: {
    enabled: true,
    strictMode: true,
    logViolations: true,
  },
  regions: {
    enabled: true,
    strictMode: true,
    logViolations: true,
  },
  taxonomy: {
    enabled: true,
    strictMode: true,
    logViolations: true,
  },
  mcp: {
    enabled: true,
    strictMode: true,
    logViolations: true,
  },
};

/**
 * Main Agent Passport middleware
 */
export function agentPassportMiddleware(
  options: AgentPassportMiddlewareOptions = {}
): (req: AgentRequest, res: Response, next: NextFunction) => void {
  const config = { ...DEFAULT_OPTIONS, ...options };

  return async (req: AgentRequest, res: Response, next: NextFunction) => {
    try {
      // Skip middleware for specified paths
      if (config.skipPaths.some((path) => req.path.startsWith(path))) {
        return next();
      }

      // Extract agent ID from header
      const agentId = req.headers["x-agent-passport-id"] as string;

      if (!agentId) {
        if (config.failClosed) {
          return res.status(400).json({
            error: "agent_passport_required",
            message: "X-Agent-Passport-Id header is required",
          });
        }
        return next();
      }

      // Verify agent passport
      const agent = await verifyAgentPassport(agentId, {
        baseUrl: config.baseUrl,
        timeout: config.timeout,
        cache: config.cache,
      });

      // Attach agent to request
      req.agent = agent;

      // Run enforcement checks
      await runEnforcementChecks(req, res, config);

      next();
    } catch (error: any) {
      if (error instanceof AgentPassportError) {
        return res.status(error.statusCode).json({
          error: error.code,
          message: error.message,
          agent_id: error.agentId,
        });
      }

      console.error("Agent Passport middleware error:", error);
      if (config.failClosed) {
        return res.status(500).json({
          error: "middleware_error",
          message: "Failed to process agent passport",
        });
      }

      next();
    }
  };
}

/**
 * Run all enforcement checks
 */
async function runEnforcementChecks(
  req: AgentRequest,
  res: Response,
  config: Required<AgentPassportMiddlewareOptions>
): Promise<void> {
  if (!req.agent) return;

  // Assurance enforcement
  if (config.assurance.enabled) {
    const assuranceResult = checkAssuranceRequirements(
      req.agent,
      config.assurance.defaultMinimum || "L0",
      config.assurance
    );

    if (!assuranceResult.allowed) {
      throw new AgentPassportError(
        assuranceResult.violations?.[0]?.reason ||
          "Insufficient assurance level",
        "insufficient_assurance",
        403,
        req.agent.agent_id
      );
    }
  }

  // Capability enforcement
  if (config.capabilities?.enforceOnAllRoutes) {
    const capabilityEnforcer = createCapabilityEnforcer(config.capabilities);
    const agentCapabilities =
      req.agent.capabilities?.map((c: any) => c.id) || [];

    const capabilityResult = capabilityEnforcer(req.path, agentCapabilities);

    if (!capabilityResult.allowed) {
      throw new AgentPassportError(
        `Missing required capabilities: ${capabilityResult.missing.join(", ")}`,
        "insufficient_capabilities",
        403,
        req.agent.agent_id
      );
    }
  }

  // Limits enforcement
  if (config.limits.enabled) {
    const limitsResult = checkLimits(req.agent, req.body || {}, config.limits);
    if (!limitsResult.allowed) {
      throw new AgentPassportError(
        "Request exceeds agent limits",
        "limits_exceeded",
        403,
        req.agent.agent_id
      );
    }
  }

  // Region validation - disabled for now
  // if (config.regions.enabled) {
  //   await sdkRegionMiddleware(config.regions)(req, res, () => {});
  // }

  // Taxonomy validation - disabled for now
  // if (config.taxonomy?.enabled) {
  //   await sdkTaxonomyMiddleware(config.taxonomy)(req, res, () => {});
  // }

  // MCP enforcement - disabled for now
  // if (config.mcp.enabled) {
  //   await sdkMCPMiddleware(config.mcp)(req, res, () => {});
  // }
}

/**
 * Express route guard for specific assurance level
 */
export function requireAssuranceLevel(level: any) {
  return (req: AgentRequest, res: Response, next: NextFunction) => {
    if (!req.agent) {
      return res.status(400).json({
        error: "agent_required",
        message: "Agent passport required",
      });
    }

    const result = checkAssuranceRequirements(req.agent, level);

    if (!result.allowed) {
      return res.status(403).json({
        error: "insufficient_assurance",
        message: `Agent assurance level ${req.agent.assurance_level} does not meet required level ${level}`,
        violations: result.violations,
      });
    }

    next();
  };
}

/**
 * Express route guard for specific assurance method
 */
export function requireAssuranceMethod(method: string) {
  return (req: AgentRequest, res: Response, next: NextFunction) => {
    if (!req.agent) {
      return res.status(400).json({
        error: "agent_required",
        message: "Agent passport required",
      });
    }

    // Check if agent has the required assurance method
    if (req.agent.assurance_method !== method) {
      return res.status(403).json({
        error: "insufficient_assurance_method",
        message: `Agent assurance method ${req.agent.assurance_method} does not match required method ${method}`,
        current_method: req.agent.assurance_method,
        required_method: method,
      });
    }

    next();
  };
}

/**
 * Get agent from request
 */
export function getAgent(req: AgentRequest): AgentPassport | undefined {
  return req.agent;
}

/**
 * Check if agent has specific permission
 */
export function hasAgentPermission(
  req: AgentRequest,
  permission: string
): boolean {
  if (!req.agent) return false;
  // Check if agent has capability with the permission ID
  return (
    req.agent.capabilities?.some((cap: any) => cap.id === permission) || false
  );
}

/**
 * Check if agent is allowed in specific region
 */
export function isAgentAllowedInRegion(
  req: AgentRequest,
  region: string
): boolean {
  if (!req.agent) return false;
  return req.agent.regions?.includes(region) || false;
}

/**
 * Express route guard for policy enforcement
 */
export function requirePolicy(
  policyId: string,
  agentId: string,
  context?: any
) {
  return async (req: AgentRequest, res: Response, next: NextFunction) => {
    try {
      const result = await verifyPolicy(
        agentId,
        policyId,
        context || req.body || {}
      );

      if (!result.allowed) {
        // Enhanced error response with refunds.v1 specific fields
        const errorResponse: any = {
          error: result.error?.code || "policy_violation",
          message: result.error?.message || "Policy violation",
          violations: result.error?.violations || [],
        };

        // Add refunds.v1 specific fields if available
        if (result.result?.evaluation) {
          errorResponse.decision_id = result.result.evaluation.decision_id;
          errorResponse.remaining_daily_cap =
            result.result.evaluation.remaining_daily_cap;
          errorResponse.expires_in = result.result.evaluation.expires_in;
        }

        return res.status(403).json(errorResponse);
      }

      // Attach policy result to request
      if (result.result) {
        req.policyResult = result.result;
      }

      next();
    } catch (error) {
      console.error("Policy enforcement error:", error);
      res.status(500).json({
        error: "policy_enforcement_error",
        message: "Failed to enforce policy compliance",
      });
    }
  };
}

/**
 * Express route guard for policy enforcement with custom context
 */
export function requirePolicyWithContext(
  policyId: string,
  agentId: string,
  context: any
) {
  return async (req: AgentRequest, res: Response, next: NextFunction) => {
    try {
      const result = await verifyPolicy(agentId, policyId, context);

      if (!result.allowed) {
        return res.status(403).json({
          error: result.error?.code || "policy_violation",
          message: result.error?.message || "Policy violation",
          violations: result.error?.violations || [],
        });
      }

      // Attach policy result to request
      if (result.result) {
        req.policyResult = result.result;
      }

      next();
    } catch (error) {
      console.error("Policy enforcement error:", error);
      res.status(500).json({
        error: "policy_enforcement_error",
        message: "Failed to enforce policy compliance",
      });
    }
  };
}

/**
 * Express middleware for limits enforcement
 */
export function limitsEnforcementMiddleware(
  config: Partial<LimitsEnforcementConfig> = {}
): (req: AgentRequest, res: Response, next: NextFunction) => void {
  return async (req: AgentRequest, res: Response, next: NextFunction) => {
    if (!req.agent) {
      return res.status(400).json({
        error: "agent_required",
        message: "Agent passport required",
      });
    }

    try {
      const result = checkLimits(req.agent, req.body || {}, config);

      if (!result.allowed) {
        return res.status(403).json({
          error: "limits_exceeded",
          message: "Request exceeds agent limits",
          violations: result.violations,
        });
      }

      next();
    } catch (error) {
      console.error("Limits enforcement error:", error);
      res.status(500).json({
        error: "limits_enforcement_error",
        message: "Failed to enforce limits",
      });
    }
  };
}

/**
 * Express middleware for region validation
 */
export function regionValidationMiddleware(
  config: Partial<RegionValidationConfig> = {}
): (req: AgentRequest, res: Response, next: NextFunction) => void {
  return async (req: AgentRequest, res: Response, next: NextFunction) => {
    if (!req.agent) {
      return res.status(400).json({
        error: "agent_required",
        message: "Agent passport required",
      });
    }

    try {
      const region = (req.headers["x-region"] as string) || req.body?.region;
      if (!region) {
        return res.status(400).json({
          error: "region_required",
          message: "Region header or body required",
        });
      }

      const isAllowed = isAllowedInRegion(req.agent, region);

      if (!isAllowed) {
        return res.status(403).json({
          error: "region_not_allowed",
          message: "Agent not allowed in this region",
        });
      }

      next();
    } catch (error) {
      console.error("Region validation error:", error);
      res.status(500).json({
        error: "region_validation_error",
        message: "Failed to validate region",
      });
    }
  };
}

/**
 * Express middleware for taxonomy validation
 */
export function taxonomyValidationMiddleware(
  config: Partial<TaxonomyValidationConfig> = {}
): (req: AgentRequest, res: Response, next: NextFunction) => void {
  return async (req: AgentRequest, res: Response, next: NextFunction) => {
    if (!req.agent) {
      return res.status(400).json({
        error: "agent_required",
        message: "Agent passport required",
      });
    }

    try {
      const result = validateTaxonomyForAgent(req.agent, config);

      if (!result.allowed) {
        return res.status(403).json({
          error: "taxonomy_validation_failed",
          message: "Agent taxonomy validation failed",
          violations: result.violations,
        });
      }

      next();
    } catch (error) {
      console.error("Taxonomy validation error:", error);
      res.status(500).json({
        error: "taxonomy_validation_error",
        message: "Failed to validate taxonomy",
      });
    }
  };
}

/**
 * Express middleware for MCP enforcement
 */
export function mcpEnforcementMiddleware(
  config: Partial<MCPEnforcementConfig> = {}
): (req: AgentRequest, res: Response, next: NextFunction) => void {
  return async (req: AgentRequest, res: Response, next: NextFunction) => {
    if (!req.agent) {
      return res.status(400).json({
        error: "agent_required",
        message: "Agent passport required",
      });
    }

    try {
      const context = {
        path: req.path,
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: req.body,
      };

      const result = checkMCPEnforcement(req.agent, context, config);

      if (!result.allowed) {
        return res.status(403).json({
          error: "mcp_enforcement_failed",
          message: "MCP enforcement failed",
          violations: result.violations,
        });
      }

      next();
    } catch (error) {
      console.error("MCP enforcement error:", error);
      res.status(500).json({
        error: "mcp_enforcement_error",
        message: "Failed to enforce MCP",
      });
    }
  };
}

/**
 * Express middleware for capability enforcement
 */
export function capabilityEnforcementMiddleware(
  config: Partial<CapabilityEnforcementConfig> = {}
): (req: AgentRequest, res: Response, next: NextFunction) => void {
  return async (req: AgentRequest, res: Response, next: NextFunction) => {
    if (!req.agent) {
      return res.status(400).json({
        error: "agent_required",
        message: "Agent passport required",
      });
    }

    try {
      const requiredCapabilities = config.requiredCapabilities || [];
      const result = checkCapabilities(req.agent, requiredCapabilities, config);

      if (!result.allowed) {
        return res.status(403).json({
          error: "insufficient_capabilities",
          message: "Agent lacks required capabilities",
          violations: result.violations,
          missing: result.missing,
        });
      }

      next();
    } catch (error) {
      console.error("Capability enforcement error:", error);
      res.status(500).json({
        error: "capability_enforcement_error",
        message: "Failed to enforce capabilities",
      });
    }
  };
}

/**
 * Create Express middleware with explicit agent ID
 */
export function createAgentPassportMiddleware(
  agentId: string,
  config: Partial<AgentPassportMiddlewareOptions> = {}
): (req: AgentRequest, res: Response, next: NextFunction) => void {
  return agentPassportMiddleware({
    ...config,
    // agentId is handled differently in the clean SDK
  });
}

/**
 * Express middleware specifically for refunds.v1 policy
 * Uses the SDK's refunds helper for proper separation of concerns
 */
export function requireRefundsPolicy(
  agentId: string,
  options: {
    failClosed?: boolean;
    logViolations?: boolean;
    cacheTtl?: number;
  } = {}
) {
  return async (req: AgentRequest, res: Response, next: NextFunction) => {
    try {
      const { processRefund, createRefundContext } = await import(
        "../../../sdk/node/src/refunds"
      );

      // Create refund context using SDK helper
      const refundContext = createRefundContext(
        req.body,
        req.headers as Record<string, string>
      );

      // Process refund using SDK helper
      const result = await processRefund(refundContext, {
        agentId,
        failClosed: options.failClosed ?? true,
        logViolations: options.logViolations ?? true,
        cacheTtl: options.cacheTtl ?? 60,
      });

      if (!result.allowed) {
        if (options.logViolations !== false) {
          console.warn(`Refunds policy violation for agent ${agentId}:`, {
            error: result.error?.code,
            message: result.error?.message,
            context: refundContext,
          });
        }

        const errorResponse: any = {
          success: false,
          error: result.error?.code || "refund_policy_violation",
          message: result.error?.message || "Refund request violates policy",
          reasons: result.error?.reasons || [],
        };

        // Add refunds.v1 specific fields
        if (result.decision_id) {
          errorResponse.decision_id = result.decision_id;
        }
        if (result.remaining_daily_cap) {
          errorResponse.remaining_daily_cap = result.remaining_daily_cap;
        }
        if (result.expires_in) {
          errorResponse.expires_in = result.expires_in;
        }

        return res.status(403).json(errorResponse);
      }

      // Attach policy result to request for use in route handler
      req.policyResult = {
        evaluation: {
          decision_id: result.decision_id,
          remaining_daily_cap: result.remaining_daily_cap,
          expires_in: result.expires_in,
        },
        refund_id: result.refund_id,
      };

      next();
    } catch (error) {
      console.error("Refunds policy enforcement error:", error);

      if (options.failClosed !== false) {
        return res.status(500).json({
          success: false,
          error: "refund_policy_error",
          message: "Failed to verify refund policy compliance",
        });
      }

      next();
    }
  };
}

/**
 * Get agent passport from request (Express-specific)
 */
export function getAgentPassport(req: AgentRequest): AgentPassport | null {
  return req.agent || null;
}
