import { Request, Response, NextFunction } from "express";
export interface AgentPassport {
    agent_id: string;
    status: "active" | "suspended" | "revoked" | "draft";
    permissions: string[];
    limits: Record<string, any>;
    regions: string[];
    verified_at: string;
}
export declare class AgentPassportError extends Error {
    code: string;
    statusCode: number;
    agentId?: string | undefined;
    constructor(message: string, code: string, statusCode: number, agentId?: string | undefined);
}
export interface AgentPassportMiddlewareOptions {
    baseUrl?: string;
    timeout?: number;
    cache?: boolean;
    failClosed?: boolean;
    requiredPermissions?: string[];
    allowedRegions?: string[];
    skipPaths?: string[];
    skipMethods?: string[];
}
export interface AgentRequest extends Request {
    agent?: AgentPassport;
}
/**
 * Express.js middleware for Agent Passport verification
 * @param options - Middleware configuration options
 * @returns Express middleware function
 */
export declare function agentPassportMiddleware(options?: AgentPassportMiddlewareOptions): (req: AgentRequest, res: Response, next: NextFunction) => void;
/**
 * Helper function to check if agent has permission
 * @param req - Express request object
 * @param permission - Permission to check
 * @returns True if agent has permission
 */
export declare function hasAgentPermission(req: AgentRequest, permission: string): boolean;
/**
 * Helper function to check if agent is allowed in region
 * @param req - Express request object
 * @param region - Region to check
 * @returns True if agent is allowed in region
 */
export declare function isAgentAllowedInRegion(req: AgentRequest, region: string): boolean;
/**
 * Helper function to get agent from request
 * @param req - Express request object
 * @returns Agent passport data or undefined
 */
export declare function getAgent(req: AgentRequest): AgentPassport | undefined;
/**
 * Helper function to check if request has agent
 * @param req - Express request object
 * @returns True if request has agent
 */
export declare function hasAgent(req: AgentRequest): boolean;
//# sourceMappingURL=index.d.ts.map