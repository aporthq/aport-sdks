import { cors } from "../../utils/cors";
import { createAdminRateLimiter, RateLimiter } from "../../utils/rate-limit";
import { createLogger } from "../../utils/logger";
import { createOrgKey } from "../../utils/org-keys";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";

interface Env {
  ai_passport_registry: KVNamespace;
  ADMIN_TOKEN: string;
  ADMIN_RPM?: string;
}

interface IssueOrgKeyRequest {
  agent_id: string;
  owner_email?: string;
  owner_github?: string;
  expires_in_days?: number;
}

/**
 * components:
 *   schemas:
 *     IssueOrgKeyRequest:
 *       type: object
 *       required:
 *         - agent_id
 *       properties:
 *         agent_id:
 *           type: string
 *           description: Agent ID to issue org key for
 *           example: "ap_128094d3"
 *         owner_email:
 *           type: string
 *           description: Owner email address
 *           example: "owner@example.com"
 *         owner_github:
 *           type: string
 *           description: Owner GitHub username
 *           example: "johndoe"
 *         expires_in_days:
 *           type: number
 *           description: Number of days until key expires (optional)
 *           example: 365
 *     IssueOrgKeyResponse:
 *       type: object
 *       required:
 *         - ok
 *         - message
 *         - agent_id
 *         - org_key_id
 *         - org_key_secret
 *       properties:
 *         ok:
 *           type: boolean
 *           description: Success status
 *           example: true
 *         message:
 *           type: string
 *           description: Success message
 *           example: "Org key issued successfully"
 *         agent_id:
 *           type: string
 *           description: Agent ID
 *           example: "ap_128094d3"
 *         org_key_id:
 *           type: string
 *           description: Generated org key ID
 *           example: "org_abc123_def456"
 *         org_key_secret:
 *           type: string
 *           description: Generated org key secret (only shown once)
 *           example: "abc123def456..."
 */

export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const startTime = Date.now();
  const headers = cors(request);
  const logger = createLogger(env.ai_passport_registry);

  // Rate limiting for admin endpoints
  const rateLimiter = createAdminRateLimiter(
    env.ai_passport_registry,
    parseInt(env.ADMIN_RPM || "100")
  );

  const clientIP = RateLimiter.getClientIP(request);
  const rateLimitResult = await rateLimiter.checkLimit(clientIP);

  if (!rateLimitResult.allowed) {
    const response = new Response(
      JSON.stringify({
        error: "rate_limit_exceeded",
        message: "Too many admin requests. Please try again later.",
        retry_after: rateLimitResult.retryAfter,
      }),
      {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": rateLimitResult.retryAfter?.toString() || "60",
          "x-ratelimit-limit": "100",
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": new Date(
            rateLimitResult.resetTime
          ).toISOString(),
          ...headers,
        },
      }
    );

    await logger.logRequest(request, response, startTime);
    return response;
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env.ADMIN_TOKEN}`) {
    const response = new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json", ...headers },
    });

    await logger.logRequest(request, response, startTime);
    return response;
  }

  try {
    const body = (await request.json()) as IssueOrgKeyRequest;

    if (!body.agent_id) {
      const response = new Response(
        JSON.stringify({ error: "missing_agent_id" }),
        {
          status: 400,
          headers: { "content-type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Verify agent exists
    const agentKey = `passport:${body.agent_id}`;
    const existingAgent = await env.ai_passport_registry.get(agentKey, "json");
    if (!existingAgent) {
      const response = new Response(
        JSON.stringify({ error: "agent_not_found" }),
        {
          status: 404,
          headers: { "content-type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Create org key
    const { keyId, secret } = await createOrgKey(
      env.ai_passport_registry,
      body.agent_id,
      body.owner_email,
      body.owner_github,
      body.expires_in_days
    );

    const response = new Response(
      JSON.stringify({
        ok: true,
        message: "Org key issued successfully",
        agent_id: body.agent_id,
        org_key_id: keyId,
        org_key_secret: secret,
        expires_in_days: body.expires_in_days,
        warning:
          "Store the org_key_secret securely - it will not be shown again",
      }),
      {
        status: 201,
        headers: {
          "content-type": "application/json",
          "x-ratelimit-limit": "100",
          "x-ratelimit-remaining": rateLimitResult.remaining.toString(),
          "x-ratelimit-reset": new Date(
            rateLimitResult.resetTime
          ).toISOString(),
          ...headers,
        },
      }
    );

    await logger.logRequest(request, response, startTime);
    return response;
  } catch (error) {
    console.error("Error issuing org key:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to issue org key",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json", ...headers },
      }
    );

    await logger.logRequest(request, response, startTime);
    return response;
  }
};
