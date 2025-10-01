import { cors } from "../../../utils/cors";
import { createAdminRateLimiter, RateLimiter } from "../../../utils/rate-limit";
import { createLogger } from "../../../utils/logger";
import { getAuditTrail } from "../../../utils/audit-trail";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";

interface Env {
  ai_passport_registry: KVNamespace;
  ADMIN_TOKEN: string;
  ADMIN_RPM?: string;
}

export const onRequestGet: PagesFunction<Env> = async ({
  request,
  env,
  params,
}) => {
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
    const agentId = params.agent_id as string;

    if (!agentId) {
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

    const auditTrail = await getAuditTrail(env.ai_passport_registry, agentId);

    // Sort actions by timestamp descending (most recent first)
    if (auditTrail) {
      auditTrail.actions.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    }

    // Get passport data to determine if it's an instance or template
    const passportKey = `passport:${agentId}`;
    const passportData = (await env.ai_passport_registry.get(
      passportKey,
      "json"
    )) as any;

    const response = new Response(
      JSON.stringify({
        ok: true,
        agent_id: agentId,
        passport_type: passportData?.kind || "template",
        parent_agent_id: passportData?.parent_agent_id || null,
        platform_id: passportData?.platform_id || null,
        controller_id: passportData?.controller_id || null,
        audit_trail: auditTrail,
      }),
      {
        status: 200,
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
    console.error("Error fetching Verifiable Attestation:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to fetch Verifiable Attestation",
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
