/**
 * Production-grade thin SDK Client - API calls only
 * No policy logic, no Cloudflare imports, no counters
 */

import {
  PolicyVerificationRequest,
  PolicyVerificationResponse,
  Jwks,
} from "./types/decision";
import { AportError } from "./errors";

// Re-export for convenience
export { AportError };

export interface APortClientOptions {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
}

export class APortClient {
  private opts: APortClientOptions;
  private jwksCache?: Jwks;
  private jwksCacheExpiry?: number;

  constructor(opts: APortClientOptions = {}) {
    this.opts = {
      baseUrl: "https://api.aport.io",
      timeoutMs: 800,
      ...opts,
    };
  }

  /**
   * Verify a policy against an agent
   */
  async verifyPolicy(
    agentId: string,
    policyId: string,
    context: Record<string, any> = {},
    idempotencyKey?: string
  ): Promise<PolicyVerificationResponse> {
    const request: PolicyVerificationRequest = {
      agent_id: agentId,
      context,
      idempotency_key: idempotencyKey,
    };

    return this.post(`/api/verify/policy/${policyId}`, request, idempotencyKey);
  }

  /**
   * Get a decision token for near-zero latency validation
   */
  async getDecisionToken(
    agentId: string,
    policyId: string,
    context: Record<string, any> = {}
  ): Promise<string> {
    const request: PolicyVerificationRequest = {
      agent_id: agentId,
      context,
    };

    const response = await this.post(`/api/verify/token/${policyId}`, request);
    return response.token;
  }

  /**
   * Validate a decision token locally using JWKS
   */
  async validateDecisionTokenLocal(
    token: string
  ): Promise<PolicyVerificationResponse> {
    try {
      const jwks = await this.getJwks();
      // For now, we'll still use the server endpoint
      // TODO: Implement local JWT validation with JWKS
      return this.validateDecisionToken(token);
    } catch (error) {
      throw new AportError(401, [
        { code: "INVALID_TOKEN", message: "Token validation failed" },
      ]);
    }
  }

  /**
   * Validate a decision token via server (for debugging)
   */
  async validateDecisionToken(
    token: string
  ): Promise<PolicyVerificationResponse> {
    const response = await this.post("/api/verify/token/validate", { token });
    return response.decision;
  }

  /**
   * Get passport verification view (for debugging/about pages)
   */
  async getPassportView(agentId: string): Promise<any> {
    return this.get(`/api/passports/${agentId}/verify_view`);
  }

  /**
   * Get JWKS for local token validation
   */
  async getJwks(): Promise<Jwks> {
    // Check cache first
    if (
      this.jwksCache &&
      this.jwksCacheExpiry &&
      Date.now() < this.jwksCacheExpiry
    ) {
      return this.jwksCache;
    }

    try {
      const response = await this.get("/jwks.json");
      this.jwksCache = response;
      this.jwksCacheExpiry = Date.now() + 5 * 60 * 1000; // Cache for 5 minutes
      return response;
    } catch (error) {
      throw new AportError(500, [
        { code: "JWKS_FETCH_FAILED", message: "Failed to fetch JWKS" },
      ]);
    }
  }

  // --- Core HTTP methods ---

  private async post(
    path: string,
    body: any,
    idempotencyKey?: string
  ): Promise<any> {
    return this.request("POST", path, body, idempotencyKey);
  }

  private async get(path: string): Promise<any> {
    return this.request("GET", path);
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    body?: any,
    idempotencyKey?: string
  ): Promise<any> {
    const url = this.url(path);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "aport-sdk-js/0.1.0",
    };

    if (this.opts.apiKey) {
      headers["Authorization"] = `Bearer ${this.opts.apiKey}`;
    }

    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.opts.timeoutMs!);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const serverTiming = response.headers.get("server-timing") ?? undefined;
      const text = await response.text();
      let json: any;

      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = {};
      }

      if (!response.ok) {
        throw new AportError(
          response.status,
          json?.reasons,
          json?.decision_id,
          serverTiming,
          text
        );
      }

      if (serverTiming) {
        json = { ...json, _meta: { serverTiming } };
      }

      return json;
    } catch (error) {
      clearTimeout(timeout);

      if (error instanceof AportError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new AportError(408, [
          { code: "TIMEOUT", message: "Request timeout" },
        ]);
      }

      throw new AportError(0, [
        {
          code: "NETWORK_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      ]);
    }
  }

  private url(path: string): string {
    const baseUrl = (this.opts.baseUrl || "https://api.aport.io").replace(
      /\/+$/,
      ""
    );
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${baseUrl}${cleanPath}`;
  }
}

// Convenience functions for common policies
export class PolicyVerifier {
  constructor(private client: APortClient) {}

  async verifyRefund(
    agentId: string,
    context: {
      amount: number;
      currency: string;
      order_id: string;
      reason?: string;
    },
    idempotencyKey?: string
  ): Promise<PolicyVerificationResponse> {
    return this.client.verifyPolicy(
      agentId,
      "finance.payment.refund.v1",
      context,
      idempotencyKey
    );
  }

  async verifyRelease(
    agentId: string,
    context: {
      repository: string;
      version: string;
      files: string[];
    },
    idempotencyKey?: string
  ): Promise<PolicyVerificationResponse> {
    return this.client.verifyPolicy(
      agentId,
      "code.release.publish.v1",
      context,
      idempotencyKey
    );
  }

  async verifyDataExport(
    agentId: string,
    context: {
      data_types: string[];
      destination: string;
      format: string;
    },
    idempotencyKey?: string
  ): Promise<PolicyVerificationResponse> {
    return this.client.verifyPolicy(
      agentId,
      "data.export.create.v1",
      context,
      idempotencyKey
    );
  }

  async verifyMessaging(
    agentId: string,
    context: {
      channel: string;
      message: string;
      mentions?: string[];
    },
    idempotencyKey?: string
  ): Promise<PolicyVerificationResponse> {
    return this.client.verifyPolicy(
      agentId,
      "messaging.message.send.v1",
      context,
      idempotencyKey
    );
  }

  async verifyRepository(
    agentId: string,
    context: {
      operation: "create_pr" | "merge";
      repository: string;
      base_branch?: string;
      pr_size_kb?: number;
      file_paths?: string[];
      github_actor?: string;
      title?: string;
      description?: string;
    },
    idempotencyKey?: string
  ): Promise<PolicyVerificationResponse> {
    return this.client.verifyPolicy(
      agentId,
      "code.repository.merge.v1",
      context,
      idempotencyKey
    );
  }
}
