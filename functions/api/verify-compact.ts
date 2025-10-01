import { cors } from "../utils/cors";
import { createVerifyRateLimiter, RateLimiter } from "../utils/rate-limit";
import { createLogger } from "../utils/logger";
import { createCache } from "../utils/cache";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";

/**
 * components:
 *   schemas:
 *     CompactPassport:
 *       type: object
 *       required:
 *         - id
 *         - owner
 *         - role
 *         - status
 *         - version
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the AI agent
 *           example: "aeebc92d-13fb-4e23-8c3c-1aa82b167da6"
 *         owner:
 *           type: string
 *           description: Organization or individual who owns the agent
 *           example: "Acme Corp"
 *         role:
 *           type: string
 *           description: Functional role or tier of the agent
 *           example: "Tier-1"
 *         status:
 *           type: string
 *           enum: [active, suspended, revoked]
 *           description: Current status of the agent
 *           example: "active"
 *         version:
 *           type: string
 *           description: Passport schema version
 *           example: "1.0.0"
 */

interface Env {
  ai_passport_registry: KVNamespace;
  AP_VERSION: string;
  VERIFY_RPM?: string; // Rate limit: requests per minute for verify endpoints
}

interface CompactPassport {
  id: string;
  slug: string;
  name: string;
  owner_id: string;
  owner_type: string;
  owner_display: string;
  controller_type: string;
  claimed: boolean;
  role: string;
  description: string;
  capabilities: Array<{ id: string; params?: Record<string, any> }>;
  limits: Record<string, any>;
  regions: string[];
  status: string;
  verification_status: string;
  verification_method?: string;
  verification_evidence?: Record<string, any>;
  assurance_level: string;
  assurance_method?: string;
  assurance_verified_at?: string;
  contact: string;
  links: Record<string, any>;
  categories?: string[];
  framework?: string[];
  logo_url?: string;
  source: string;
  created_at: string;
  updated_at: string;
  version: string;
  model_info?: Record<string, any>;
}

/**
 * /api/verify-compact:
 *   get:
 *     summary: Verify an agent passport (compact format)
 *     description: Retrieve a minimal set of agent passport data for quick verification
 *     operationId: verifyAgentCompact
 *     tags:
 *       - Verification
 *     parameters:
 *       - name: agent_id
 *         in: query
 *         required: true
 *         description: Unique identifier for the AI agent
 *         schema:
 *           type: string
 *           example: "aeebc92d-13fb-4e23-8c3c-1aa82b167da6"
 *     responses:
 *       200:
 *         description: Agent passport found and verified (compact format)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CompactPassport'
 *             example:
 *               id: "aeebc92d-13fb-4e23-8c3c-1aa82b167da6"
 *               owner: "Acme Corp"
 *               role: "Tier-1"
 *               status: "active"
 *               version: "1.0.0"
 *         headers:
 *           Cache-Control:
 *             description: Cache control directive
 *             schema:
 *               type: string
 *               example: "public, s-maxage=60"
 *           X-Agent-Passport-Version:
 *             description: Version of the passport schema
 *             schema:
 *               type: string
 *       400:
 *         description: Missing required parameter
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "missing agent_id"
 *       404:
 *         description: Agent passport not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "not_found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "internal_server_error"
 */
export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const startTime = Date.now();
  const headers = cors(request);
  const url = new URL(request.url);
  const agentId = url.searchParams.get("agent_id");

  // Initialize logger and cache
  const logger = createLogger(env.ai_passport_registry);
  const cache = createCache(env.ai_passport_registry, 300); // 5 minute cache

  // Rate limiting
  const rateLimiter = createVerifyRateLimiter(
    env.ai_passport_registry,
    parseInt(env.VERIFY_RPM || "60")
  );

  const clientIP = RateLimiter.getClientIP(request);
  const rateLimitResult = await rateLimiter.checkLimit(clientIP);

  if (!rateLimitResult.allowed) {
    const response = new Response(
      JSON.stringify({
        error: "rate_limit_exceeded",
        message: "Too many requests. Please try again later.",
        retry_after: rateLimitResult.retryAfter,
      }),
      {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": rateLimitResult.retryAfter?.toString() || "60",
          "x-ratelimit-limit": "60",
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": new Date(
            rateLimitResult.resetTime
          ).toISOString(),
          ...headers,
        },
      }
    );

    await logger.logRequest(request, response, startTime, {
      agentId: agentId || undefined,
    });
    return response;
  }

  if (!agentId) {
    const response = new Response(
      JSON.stringify({ error: "missing agent_id" }),
      {
        status: 400,
        headers: { "content-type": "application/json", ...headers },
      }
    );

    await logger.logRequest(request, response, startTime, {
      agentId: agentId || undefined,
    });
    return response;
  }

  const key = `passport:${agentId}`;

  // Try cache first
  let raw = await cache.get<any>(key);

  if (!raw) {
    // Cache miss, get from KV
    raw = (await env.ai_passport_registry.get(key, "json")) as any | null;

    if (raw) {
      // Cache the result for future requests
      await cache.set(key, raw, 300); // 5 minute cache
    }
  }

  if (!raw) {
    const response = new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { "content-type": "application/json", ...headers },
    });

    await logger.logRequest(request, response, startTime, { agentId });
    return response;
  }

  // Check for Easter egg: Accept: text/plain returns ASCII passport stamp
  const acceptHeader = request.headers.get("Accept");
  if (acceptHeader && acceptHeader.includes("text/plain")) {
    const canonicalHash = raw.canonical_hash || "unknown";
    const hashPreview = canonicalHash.substring(0, 8);

    const asciiStamp = `
╔══════════════════════════════════════╗
║           AGENT PASSPORT             ║
║                                      ║
║  Agent ID: ${raw.agent_id.padEnd(20)} ║
║  Owner:    ${raw.owner.padEnd(20)} ║
║  Status:   ${raw.status.toUpperCase().padEnd(20)} ║
║  Hash:     ${hashPreview.padEnd(20)} ║
║                                      ║
║  🛡️  VERIFIED BY AGENT PASSPORT  🛡️  ║
║                                      ║
║  https://aport.io           ║
╚══════════════════════════════════════╝`;

    const response = new Response(asciiStamp, {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, s-maxage=60",
        "x-agent-passport-version": raw.version || env.AP_VERSION,
        "x-ratelimit-limit": "60",
        "x-ratelimit-remaining": rateLimitResult.remaining.toString(),
        "x-ratelimit-reset": new Date(rateLimitResult.resetTime).toISOString(),
        ...headers,
      },
    });

    await logger.logRequest(request, response, startTime, { agentId });
    return response;
  }

  // Return compact format with all essential fields including capabilities
  const compact: CompactPassport = {
    id: raw.agent_id,
    slug: raw.slug,
    name: raw.name,
    owner_id: raw.owner_id,
    owner_type: raw.owner_type,
    owner_display: raw.owner_display,
    controller_type: raw.controller_type,
    claimed: raw.claimed,
    role: raw.role,
    description: raw.description,
    capabilities: raw.capabilities || [],
    limits: raw.limits || {},
    regions: raw.regions || [],
    status: raw.status,
    verification_status: raw.verification_status,
    verification_method: raw.verification_method,
    verification_evidence: raw.verification_evidence,
    assurance_level: raw.assurance_level,
    assurance_method: raw.assurance_method,
    assurance_verified_at: raw.assurance_verified_at,
    contact: raw.contact,
    links: raw.links || {},
    categories: raw.categories,
    framework: raw.framework,
    logo_url: raw.logo_url,
    source: raw.source,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    version: raw.version || env.AP_VERSION,
    model_info: raw.model_info,
  };

  const response = new Response(JSON.stringify(compact), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, s-maxage=60",
      "x-agent-passport-version": compact.version,
      "x-ratelimit-limit": "60",
      "x-ratelimit-remaining": rateLimitResult.remaining.toString(),
      "x-ratelimit-reset": new Date(rateLimitResult.resetTime).toISOString(),
      ...headers,
    },
  });

  await logger.logRequest(request, response, startTime, { agentId });
  return response;
};
