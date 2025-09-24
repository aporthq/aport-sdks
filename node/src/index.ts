import fetch, {
  RequestInit,
  Response,
  RequestInfo,
  HeadersInit,
} from "node-fetch";
import { PassportData } from "../../../types/passport";

// Re-export the shared type
export type AgentPassport = PassportData;

export interface VerificationOptions {
  baseUrl?: string;
  cache?: boolean;
  timeout?: number;
}

export class AgentPassportError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
    public agentId?: string
  ) {
    super(message);
    this.name = "AgentPassportError";
  }
}

/**
 * Wraps a fetch function to automatically include the X-Agent-Passport-Id header
 * @param agentId - The agent passport ID
 * @param fetchFn - The fetch function to wrap (defaults to global fetch)
 * @returns A wrapped fetch function that includes the agent passport header
 */
export function withAgentPassportId(
  agentId: string,
  fetchFn: any = fetch
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const headers = {
      ...((init?.headers as Record<string, string>) || {}),
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
export async function verifyAgentPassport(
  agentId: string,
  options: VerificationOptions = {}
): Promise<AgentPassport> {
  const {
    baseUrl = process.env.AGENT_PASSPORT_BASE_URL ||
      "https://passport-registry.com",
    cache = true,
    timeout = 5000,
  } = options;

  const url = `${baseUrl}/api/verify/${encodeURIComponent(agentId)}`;

  const headers: Record<string, string> = {};
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
      throw new AgentPassportError(
        "Agent passport verification failed - cache hit but no cached data available",
        "cache_error",
        304,
        agentId
      );
    }

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as any;
      throw new AgentPassportError(
        errorData.message || `HTTP ${response.status}: ${response.statusText}`,
        errorData.error || "verification_failed",
        response.status,
        agentId
      );
    }

    const data = (await response.json()) as any;

    if (data.status !== "active") {
      throw new AgentPassportError(
        `Agent is ${data.status}`,
        `agent_${data.status}`,
        403,
        agentId
      );
    }

    return data as AgentPassport;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof AgentPassportError) {
      throw error;
    }

    if ((error as any).name === "AbortError") {
      throw new AgentPassportError(
        "Verification request timed out",
        "timeout",
        408,
        agentId
      );
    }

    throw new AgentPassportError(
      error instanceof Error ? error.message : "Unknown error occurred",
      "network_error",
      0,
      agentId
    );
  }
}

/**
 * Checks if an agent has a specific permission
 * @param agent - The agent passport data
 * @param capability - The capability to check
 * @returns True if the agent has the permission
 */
export function hasCapability(
  agent: AgentPassport,
  capability: string
): boolean {
  return agent.capabilities?.map((cap) => cap.id).includes(capability) || false;
}

/**
 * Checks if an agent is allowed in a specific region
 * @param agent - The agent passport data
 * @param region - The region to check
 * @returns True if the agent is allowed in the region
 */
export function isAllowedInRegion(
  agent: AgentPassport,
  region: string
): boolean {
  return agent.regions.includes(region);
}

/**
 * Gets the current agent passport ID from environment variables
 * @returns The agent passport ID or undefined if not set
 */
export function getAgentPassportId(): string | undefined {
  return process.env.AGENT_PASSPORT_ID;
}

/**
 * Creates a fetch function with the agent passport ID from environment variables
 * @param fetchFn - The fetch function to wrap (defaults to global fetch)
 * @returns A wrapped fetch function or undefined if AGENT_PASSPORT_ID is not set
 */
export function withAgentPassportIdFromEnv(
  fetchFn: any = fetch
):
  | ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>)
  | undefined {
  const agentId = getAgentPassportId();
  return agentId ? withAgentPassportId(agentId, fetchFn) : undefined;
}

// Export all enforcement and validation modules
export * from "./assurance-enforcement";
export * from "./capability-enforcement";
export * from "./limits-enforcement";
export * from "./mcp-enforcement";
export * from "./region-validation";
export * from "./taxonomy-validation";

// Export policy enforcement functions
export {
  getPolicy,
  getPolicyResult,
  hasPolicyAccess,
  verifyPolicy,
} from "./policy-enforcement";

// Export refunds v1 helpers
export * from "./refunds";
