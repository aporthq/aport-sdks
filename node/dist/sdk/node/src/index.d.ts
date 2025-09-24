import { RequestInit, Response, RequestInfo } from "node-fetch";
import { PassportData } from "../../../types/passport";
export type AgentPassport = PassportData;
export interface VerificationOptions {
    baseUrl?: string;
    cache?: boolean;
    timeout?: number;
}
export declare class AgentPassportError extends Error {
    code: string;
    statusCode: number;
    agentId?: string | undefined;
    constructor(message: string, code: string, statusCode: number, agentId?: string | undefined);
}
/**
 * Wraps a fetch function to automatically include the X-Agent-Passport-Id header
 * @param agentId - The agent passport ID
 * @param fetchFn - The fetch function to wrap (defaults to global fetch)
 * @returns A wrapped fetch function that includes the agent passport header
 */
export declare function withAgentPassportId(agentId: string, fetchFn?: any): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
/**
 * Verifies an agent passport ID against the registry
 * @param agentId - The agent passport ID to verify
 * @param options - Verification options
 * @returns Promise resolving to the agent passport data
 */
export declare function verifyAgentPassport(agentId: string, options?: VerificationOptions): Promise<AgentPassport>;
/**
 * Checks if an agent has a specific permission
 * @param agent - The agent passport data
 * @param capability - The capability to check
 * @returns True if the agent has the permission
 */
export declare function hasCapability(agent: AgentPassport, capability: string): boolean;
/**
 * Checks if an agent is allowed in a specific region
 * @param agent - The agent passport data
 * @param region - The region to check
 * @returns True if the agent is allowed in the region
 */
export declare function isAllowedInRegion(agent: AgentPassport, region: string): boolean;
/**
 * Gets the current agent passport ID from environment variables
 * @returns The agent passport ID or undefined if not set
 */
export declare function getAgentPassportId(): string | undefined;
/**
 * Creates a fetch function with the agent passport ID from environment variables
 * @param fetchFn - The fetch function to wrap (defaults to global fetch)
 * @returns A wrapped fetch function or undefined if AGENT_PASSPORT_ID is not set
 */
export declare function withAgentPassportIdFromEnv(fetchFn?: any): ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | undefined;
export * from "./assurance-enforcement";
export * from "./capability-enforcement";
export * from "./limits-enforcement";
export * from "./mcp-enforcement";
export * from "./region-validation";
export * from "./taxonomy-validation";
export { getPolicy, getPolicyResult, hasPolicyAccess, verifyPolicy, } from "./policy-enforcement";
export * from "./refunds";
//# sourceMappingURL=index.d.ts.map