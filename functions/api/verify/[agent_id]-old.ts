import { cors } from "../../utils/cors";
import { createVerifyRateLimiter, RateLimiter } from "../../utils/rate-limit";
import { createLogger } from "../../utils/logger";
import { createCache } from "../../utils/cache";
import { buildPassportObject } from "../../utils/serialization";
import { createTieredPassportCache } from "../../utils/tiered-cache";
import {
  recordVerifyPerformance,
  recordVerifyError,
} from "../../utils/performance-monitor";
import { createPerformanceLogger } from "../../utils/performance-logger";
import {
  KVNamespace,
  R2Bucket,
  PagesFunction,
} from "@cloudflare/workers-types";
import { PassportData } from "../../../types/passport";

/**
 * Optimized fallback function to try direct KV lookup (no verbose logging)
 */
async function tryDirectKVLookupOptimized(
  kv: KVNamespace,
  agentId: string,
  version: string
): Promise<any> {
  const startTime = Date.now();

  try {
    // Try direct passport key first
    const passportKey = `passport:${agentId}`;
    const passportData = await kv.get(passportKey, "json");

    if (passportData && typeof passportData === "object") {
      const { buildPassportObject } = await import("../../utils/serialization");
      const passport = buildPassportObject(
        passportData as PassportData,
        version
      );
      const etag = generateETag(passport);

      return {
        passport,
        etag,
        source: "kv-direct",
        latency: Date.now() - startTime,
        fromCache: false,
      };
    }

    // Try serialized passport key
    const serializedKey = `passport_serialized:${agentId}`;
    const serializedData = await kv.get(serializedKey, "json");

    if (
      serializedData &&
      typeof serializedData === "object" &&
      "json" in serializedData
    ) {
      const data = serializedData as { json: any; etag: string };
      return {
        passport: data.json,
        etag: data.etag,
        source: "kv-serialized",
        latency: Date.now() - startTime,
        fromCache: false,
      };
    }

    return null;
  } catch (error) {
    // Only log errors, not normal "not found" cases
    console.error("Fallback KV lookup failed:", error);
    return null;
  }
}

/**
 * Generate ETag for passport
 */
function generateETag(passport: any): string {
  const etagData = `${passport.agent_id}-${passport.updated_at}-${passport.version}`;
  return `W/"${btoa(etagData).replace(/[+/=]/g, (c) => {
    switch (c) {
      case "+":
        return "-";
      case "/":
        return "_";
      case "=":
        return "";
      default:
        return c;
    }
  })}"`;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Passport:
 *       type: object
 *       required:
 *         - agent_id
 *         - owner_id
 *         - owner_type
 *         - owner_display
 *         - role
 *         - capabilities
 *         - limits
 *         - regions
 *         - status
 *         - contact
 *         - updated_at
 *         - version
 *       properties:
 *         agent_id:
 *           type: string
 *           description: Unique identifier for the AI agent
 *           example: "aeebc92d-13fb-4e23-8c3c-1aa82b167da6"
 *         slug:
 *           type: string
 *           description: URL-friendly identifier for the agent
 *           example: "acme-support-bot"
 *         name:
 *           type: string
 *           description: Human-readable name of the agent
 *           example: "Acme Support Bot"
 *         owner_id:
 *           type: string
 *           description: Unique identifier of the owner (user or organization)
 *           example: "ap_user_456"
 *         owner_type:
 *           type: string
 *           enum: ["user", "org"]
 *           description: Type of the owner entity
 *           example: "org"
 *         owner_display:
 *           type: string
 *           description: Display name of the owner
 *           example: "Acme Corp"
 *         controller_type:
 *           type: string
 *           description: Type of controller managing the agent
 *           example: "api"
 *         claimed:
 *           type: boolean
 *           description: Whether the agent has been claimed by its owner
 *           example: true
 *         role:
 *           type: string
 *           description: Functional role or tier of the agent
 *           example: "agent"
 *         description:
 *           type: string
 *           description: Detailed description of the agent's purpose
 *           example: "Customer support automation agent"
 *         capabilities:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 description: Capability identifier
 *                 enum: ["payments.refund", "data.export", "messaging.send", "repo.pr.create", "repo.merge"]
 *                 example: "payments.refund"
 *               params:
 *                 type: object
 *                 additionalProperties: true
 *                 description: Optional parameters for the capability
 *           description: Array of capabilities granted to the agent
 *           example: [{"id": "payments.refund"}, {"id": "data.export", "params": {"max_rows": 1000}}, {"id": "messaging.send", "params": {"channels_allowlist": ["slack", "email"]}}]
 *         limits:
 *           type: object
 *           properties:
 *             refund_amount_max_per_tx:
 *               type: number
 *               description: Maximum refund amount per transaction in USD cents
 *               example: 10000
 *             refund_amount_daily_cap:
 *               type: number
 *               description: Maximum total refunds per day in USD cents
 *               example: 100000
 *             payout_usd_daily_cap:
 *               type: number
 *               description: Maximum total payouts per day in USD cents
 *               example: 1000000
 *             max_actions_per_min:
 *               type: number
 *               description: Maximum actions per minute
 *               example: 60
 *             max_export_rows:
 *               type: number
 *               description: Maximum rows in data exports
 *               example: 10000
 *             allow_pii:
 *               type: boolean
 *               description: Whether PII access is allowed
 *               example: false
 *             max_deploys_per_day:
 *               type: number
 *               description: Maximum deployments per day
 *               example: 5
 *             msgs_per_min:
 *               type: number
 *               description: Maximum messages per minute for messaging capability
 *               example: 30
 *             msgs_per_day:
 *               type: number
 *               description: Maximum messages per day for messaging capability
 *               example: 1000
 *             max_prs_per_day:
 *               type: number
 *               description: Maximum pull requests per day for repository capability
 *               example: 10
 *             max_merges_per_day:
 *               type: number
 *               description: Maximum merges per day for repository capability
 *               example: 5
 *             max_pr_size_kb:
 *               type: number
 *               description: Maximum pull request size in KB for repository capability
 *               example: 1024
 *           description: Typed limits configuration for the agent
 *           example: {"refund_amount_max_per_tx": 10000, "max_export_rows": 1000, "allow_pii": false, "msgs_per_day": 1000, "max_prs_per_day": 10}
 *         regions:
 *           type: array
 *           items:
 *             type: string
 *           description: Geographic regions where the agent operates
 *           example: ["global", "us-east"]
 *         status:
 *           type: string
 *           enum: ["draft", "active", "suspended", "revoked"]
 *           description: Current status of the agent passport
 *           example: "active"
 *         verification_status:
 *           type: string
 *           description: Verification status of the agent
 *           example: "github_verified"
 *         verification_method:
 *           type: string
 *           description: Method used for verification
 *           example: "github_verified"
 *         verification_evidence:
 *           type: object
 *           additionalProperties: true
 *           description: Evidence supporting the verification
 *           example: {"github_username": "acme", "verified_at": "2024-01-15T10:30:00Z"}
 *         assurance_level:
 *           type: string
 *           enum: ["L0", "L1", "L2", "L3", "L4KYC", "L4FIN"]
 *           description: Assurance level of the owner (snapshot from owner)
 *           example: "L2"
 *         assurance_method:
 *           type: string
 *           description: Method used for assurance verification
 *           example: "github_verified"
 *         assurance_verified_at:
 *           type: string
 *           format: date-time
 *           description: When the assurance was verified
 *           example: "2024-01-15T10:30:00Z"
 *         contact:
 *           type: string
 *           description: Contact information for the agent
 *           example: "admin@acme.com"
 *         links:
 *           type: object
 *           properties:
 *             homepage:
 *               type: string
 *               format: uri
 *               description: Homepage URL
 *             docs:
 *               type: string
 *               format: uri
 *               description: Documentation URL
 *             repo:
 *               type: string
 *               format: uri
 *               description: Repository URL
 *           description: Related links for the agent
 *           example: {"homepage": "https://acme.com", "docs": "https://docs.acme.com"}
 *         categories:
 *           type: array
 *           items:
 *             type: string
 *             enum: ["support", "commerce", "devops", "ops", "analytics", "marketing"]
 *           description: Controlled categories for the agent
 *           example: ["support", "commerce"]
 *         framework:
 *           type: array
 *           items:
 *             type: string
 *             enum: ["n8n", "LangGraph", "CrewAI", "AutoGen", "OpenAI", "LlamaIndex", "Custom"]
 *           description: Controlled frameworks used by the agent
 *           example: ["n8n", "LangGraph"]
 *         logo_url:
 *           type: string
 *           format: uri
 *           description: URL to the agent's logo
 *           example: "https://acme.com/logo.png"
 *         source:
 *           type: string
 *           description: Source of the passport creation
 *           example: "admin"
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: When the passport was created
 *           example: "2024-01-15T10:00:00Z"
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: When the passport was last updated
 *           example: "2024-01-15T10:30:00Z"
 *         version:
 *           type: string
 *           description: Version of the passport schema
 *           example: "1.0.0"
 *         model_info:
 *           type: object
 *           additionalProperties: true
 *           description: Information about the AI model used
 *           example: {"model": "gpt-4", "provider": "openai"}
 *         registry_key_id:
 *           type: string
 *           description: Registry key used for signing
 *           example: "reg-2025-01"
 *         canonical_hash:
 *           type: string
 *           description: Hash of the canonical passport data
 *           example: "sha256:abc123..."
 *         registry_sig:
 *           type: string
 *           description: Digital signature of the passport
 *           example: "ed25519:def456..."
 *         verified_at:
 *           type: string
 *           format: date-time
 *           description: When the passport was verified
 *           example: "2024-01-15T10:30:00Z"
 *         attestations:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: ["vc", "did", "ap2", "oidc", "custom"]
 *                 description: Type of attestation
 *               issuer:
 *                 type: string
 *                 description: Attestation issuer
 *               reference:
 *                 type: string
 *                 description: Attestation reference
 *               claims:
 *                 type: object
 *                 additionalProperties: true
 *                 description: Attestation claims
 *               signature:
 *                 type: string
 *                 description: Attestation signature
 *               verified_at:
 *                 type: string
 *                 format: date-time
 *                 description: When the attestation was verified
 *           description: Array of attestations for the agent
 *         integrations:
 *           type: object
 *           properties:
 *             github:
 *               type: object
 *               properties:
 *                 allowed_actors:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Allowed GitHub actors
 *                 allowed_apps:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Allowed GitHub apps
 *               description: GitHub integration settings
 *           description: Integration settings for the agent
 *         webhook_url:
 *           type: string
 *           format: uri
 *           description: Webhook URL for the agent
 *           example: "https://webhook.example.com/agent-123"
 *         email:
 *           type: string
 *           format: email
 *           description: Email address for the agent
 *           example: "agent@example.com"
 *     ErrorResponse:
 *       type: object
 *       required:
 *         - error
 *       properties:
 *         error:
 *           type: string
 *           description: Error code or message
 *           example: "not_found"
 *         message:
 *           type: string
 *           description: Human-readable error message
 *           example: "Agent passport not found"
 */

interface Env {
  ai_passport_registry: KVNamespace;
  AP_VERSION: string;
  VERIFY_RPM?: string; // Rate limit: requests per minute for verify endpoints
  PASSPORT_SNAPSHOTS_BUCKET?: R2Bucket; // R2 bucket for fallback snapshots
}

/**
 * @swagger
 * /api/verify/{agent_id}:
 *   get:
 *     summary: Verify an agent passport
 *     description: Retrieve and verify an AI agent passport by ID
 *     operationId: verifyAgent
 *     tags:
 *       - Verification
 *     parameters:
 *       - name: agent_id
 *         in: path
 *         required: true
 *         description: Unique identifier for the AI agent
 *         schema:
 *           type: string
 *           example: "aeebc92d-13fb-4e23-8c3c-1aa82b167da6"
 *     responses:
 *       200:
 *         description: Agent passport found and verified
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Passport'
 *             example:
 *               agent_id: "aeebc92d-13fb-4e23-8c3c-1aa82b167da6"
 *               slug: "acme-support-bot"
 *               name: "Acme Support Bot"
 *               owner_id: "ap_org_456"
 *               owner_type: "org"
 *               owner_display: "Acme Corp"
 *               controller_type: "api"
 *               claimed: true
 *               role: "agent"
 *               description: "Customer support automation agent"
 *               capabilities: [{"id": "payments.refund"}, {"id": "data.export", "params": {"max_rows": 1000}}]
 *               limits:
 *                 refund_amount_max_per_tx: 10000
 *                 refund_amount_daily_cap: 100000
 *                 max_export_rows: 1000
 *                 allow_pii: false
 *               regions: ["global", "us-east"]
 *               status: "active"
 *               verification_status: "github_verified"
 *               verification_method: "github_verified"
 *               verification_evidence:
 *                 github_username: "acme"
 *                 verified_at: "2024-01-15T10:30:00Z"
 *               assurance_level: "L2"
 *               assurance_method: "github_verified"
 *               assurance_verified_at: "2024-01-15T10:30:00Z"
 *               contact: "admin@acme.com"
 *               links:
 *                 homepage: "https://acme.com"
 *                 docs: "https://docs.acme.com"
 *                 repo: "https://github.com/acme/support-bot"
 *               categories: ["support", "commerce"]
 *               framework: ["n8n", "LangGraph"]
 *               logo_url: "https://acme.com/logo.png"
 *               source: "admin"
 *               created_at: "2024-01-15T10:00:00Z"
 *               updated_at: "2024-01-15T10:30:00Z"
 *               version: "1.0.0"
 *               model_info:
 *                 model: "gpt-4"
 *                 provider: "openai"
 *               registry_key_id: "reg-2025-01"
 *               canonical_hash: "sha256:abc123..."
 *               registry_sig: "ed25519:def456..."
 *               verified_at: "2024-01-15T10:30:00Z"
 *               mcp:
 *                 servers: ["https://mcp.stripe.com", "urn:mcp:acme:helpdesk"]
 *                 tools: ["stripe.refunds.create", "notion.pages.export"]
 *               attestations:
 *                 - type: "custom"
 *                   issuer: "aport-registry"
 *                   reference: "att_123"
 *                   claims: {"type": "github_verification", "verified_at": "2024-01-15T10:30:00Z"}
 *                   signature: "ed25519:abc123..."
 *               integrations:
 *                 github:
 *                   allowed_actors: ["my-bot[bot]", "dependabot[bot]"]
 *                   allowed_apps: ["my-github-app"]
 *               webhook_url: "https://webhook.example.com/agent-123"
 *               email: "agent@example.com"
 *               evaluation:
 *                 pack_id: "payments.refund.v1"
 *                 assurance_ok: true
 *                 capability_ok: true
 *                 limits_ok: true
 *                 regions_ok: true
 *                 mcp_ok: true
 *                 reasons: []
 *         headers:
 *           ETag:
 *             description: Entity tag for caching
 *             schema:
 *               type: string
 *           Cache-Control:
 *             description: Cache control directive
 *             schema:
 *               type: string
 *               example: "public, s-maxage=60"
 *           X-Agent-Passport-Version:
 *             description: Version of the passport schema
 *             schema:
 *               type: string
 *       304:
 *         description: Not Modified - passport unchanged since last request
 *         headers:
 *           ETag:
 *             description: Entity tag for caching
 *             schema:
 *               type: string
 *       400:
 *         description: Missing required parameter
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "missing_agent_id"
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

export const onRequestGet: PagesFunction<Env> = async ({
  request,
  env,
  params,
}) => {
  const startTime = Date.now();
  const headers = cors(request);
  const url = new URL(request.url);
  const agentId = params.agent_id as string;

  // Efficient performance logging
  const perfLogger = createPerformanceLogger(agentId);
  perfLogger.start("REQUEST_START", {
    userAgent: request.headers.get("user-agent")?.substring(0, 50),
    ifNoneMatch: request.headers.get("if-none-match"),
    cfRay: request.headers.get("cf-ray"),
    cfConnectingIp: request.headers.get("cf-connecting-ip"),
  });

  // Context-based verify parameters (for templates)
  const tenantRef = url.searchParams.get("tenant_ref") || undefined;
  const platformId = url.searchParams.get("platform_id") || undefined;

  perfLogger.start("PARAMS_PARSED");
  perfLogger.end("PARAMS_PARSED", { tenantRef, platformId });

  // Initialize logger (lazy initialization for performance)
  let logger: any = null;
  const getLogger = () => {
    if (!logger) {
      logger = createLogger(env.ai_passport_registry);
    }
    return logger;
  };

  // Rate limiting (ultra-optimized - skip for most requests)
  let rateLimitResult: any = {
    allowed: true,
    remaining: 60,
    resetTime: Date.now() + 60000,
    retryAfter: 60,
  };

  // Skip rate limiting entirely for cached requests and common user agents
  const ifNoneMatch = request.headers.get("if-none-match");
  const userAgent = request.headers.get("user-agent") || "";
  const isBrowserRequest =
    userAgent.includes("Mozilla") ||
    userAgent.includes("Chrome") ||
    userAgent.includes("Safari");

  perfLogger.start("RATE_LIMIT");
  // Only do rate limiting for non-cached, non-browser requests
  if (!ifNoneMatch && !isBrowserRequest) {
    const rateLimiter = createVerifyRateLimiter(
      env.ai_passport_registry,
      parseInt(env.VERIFY_RPM || "60")
    );
    const clientIP = RateLimiter.getClientIP(request);
    rateLimitResult = await rateLimiter.checkLimit(clientIP);
    perfLogger.end("RATE_LIMIT", {
      clientIP,
      allowed: rateLimitResult.allowed,
      remaining: rateLimitResult.remaining,
    });
  } else {
    perfLogger.end("RATE_LIMIT", {
      reason: ifNoneMatch ? "cached_request" : "browser_request",
      ifNoneMatch: !!ifNoneMatch,
      isBrowserRequest,
    });
  }

  if (!rateLimitResult.allowed) {
    perfLogger.log("RATE_LIMIT_BLOCKED", Date.now() - startTime, {
      retryAfter: rateLimitResult.retryAfter,
      remaining: rateLimitResult.remaining,
    });
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

    perfLogger.logSummary();
    await getLogger().logRequest(request, response, startTime, { agentId });
    return response;
  }

  // Validate agentId
  perfLogger.start("VALIDATION");
  if (!agentId || typeof agentId !== "string" || agentId.trim().length === 0) {
    perfLogger.end("VALIDATION", {
      agentId,
      reason: "invalid_agent_id",
    });
    const response = new Response(
      JSON.stringify({
        error: "invalid_agent_id",
        message: "Agent ID is required and must be a non-empty string",
      }),
      {
        status: 400,
        headers: { "content-type": "application/json", ...headers },
      }
    );

    perfLogger.logSummary();
    await getLogger().logRequest(request, response, startTime, { agentId });
    return response;
  }

  // Normalize agentId
  const normalizedAgentId = agentId.trim();
  perfLogger.end("VALIDATION", { normalizedAgentId });

  // Initialize tiered cache with version
  perfLogger.start("CACHE_INIT");
  const tieredCache = createTieredPassportCache(
    env.ai_passport_registry,
    env.AP_VERSION
  );
  perfLogger.end("CACHE_INIT", { version: env.AP_VERSION });

  // Get passport using 3-tier caching strategy
  perfLogger.start("CACHE_LOOKUP");
  const cacheResult = await tieredCache.getPassport(normalizedAgentId);
  perfLogger.end("CACHE_LOOKUP", {
    found: !!cacheResult,
    source: cacheResult?.source,
    cacheLatency: cacheResult?.latency,
  });

  if (!cacheResult) {
    // Try direct KV lookup as fallback (optimized - no debug logging)
    perfLogger.start("FALLBACK_LOOKUP");
    const fallbackResult = await tryDirectKVLookupOptimized(
      env.ai_passport_registry,
      normalizedAgentId,
      env.AP_VERSION
    );
    perfLogger.end("FALLBACK_LOOKUP", {
      found: !!fallbackResult,
      source: fallbackResult?.source,
    });

    if (fallbackResult) {
      // Use fallback result
      const { passport, etag, source, latency } = fallbackResult;

      // Continue with normal response flow
      const serializedPassport =
        typeof passport === "string" ? passport : JSON.stringify(passport);
      const registryKeyId = `cache-${source}`;

      // Record performance metrics
      recordVerifyPerformance(
        agentId,
        source,
        latency,
        Date.now() - startTime,
        false // Not a cache hit
      );

      console.log(
        `Served passport ${agentId} from fallback ${source} (${latency}ms)`
      );

      // Return passport with optimized headers
      const totalDuration = Date.now() - startTime;
      const workerCpuTime = totalDuration - latency;
      const region = request.cf?.colo || "UNKNOWN";

      const serverTimingParts = [
        `fallback;desc="${source.toUpperCase()}"`,
        `worker;dur=${workerCpuTime.toFixed(1)}`,
        `kv;dur=${latency.toFixed(1)}`,
        `region;desc="${region}"`,
      ];

      const response = new Response(serializedPassport, {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control":
            "public, max-age=0, s-maxage=60, stale-while-revalidate=30, stale-if-error=86400",
          "server-timing": serverTimingParts.join(", "),
          etag: etag!,
          "x-registry-key-id": registryKeyId || "unknown",
          "x-cache-source": source,
          "x-cache-latency": latency.toString(),
          "aport-cache": "MISS",
          ...headers,
        },
      });

      perfLogger.logSummary();
      await getLogger().logRequest(request, response, startTime, { agentId });
      return response;
    }

    // Record error for performance monitoring
    recordVerifyError();
    perfLogger.log("PASSPORT_NOT_FOUND", Date.now() - startTime, {
      normalizedAgentId,
    });

    const response = new Response(
      JSON.stringify({
        error: "not_found",
        message: "Agent passport not found",
      }),
      {
        status: 404,
        headers: { "content-type": "application/json", ...headers },
      }
    );

    perfLogger.logSummary();
    await getLogger().logRequest(request, response, startTime, { agentId });
    return response;
  }

  const { passport, etag, source, latency } = cacheResult;

  // Handle both string and object passport data to prevent double-encoding
  perfLogger.start("SERIALIZATION");
  const serializedPassport =
    typeof passport === "string" ? passport : JSON.stringify(passport);
  const registryKeyId = `cache-${source}`;
  perfLogger.end("SERIALIZATION", {
    source,
    isString: typeof passport === "string",
    passportSize: serializedPassport.length,
  });

  // Record performance metrics
  perfLogger.start("METRICS");
  recordVerifyPerformance(
    agentId,
    source,
    latency,
    Date.now() - startTime,
    source !== "l3" // L1 and L2 are cache hits, L3 is not
  );
  perfLogger.end("METRICS", {
    source,
    cacheHit: source !== "l3",
    cacheLatency: latency,
  });

  console.log(`Served passport ${agentId} from ${source} cache (${latency}ms)`);

  // B1: Check If-None-Match header for conditional requests
  perfLogger.start("CONDITIONAL_CHECK");
  if (ifNoneMatch === etag) {
    perfLogger.end("CONDITIONAL_CHECK", {
      etag: etag?.substring(0, 20) + "...",
      ifNoneMatch: ifNoneMatch?.substring(0, 20) + "...",
    });
    const response = new Response(null, {
      status: 304,
      headers: {
        etag: etag!,
        "cache-control":
          "public, max-age=0, s-maxage=60, stale-while-revalidate=30, stale-if-error=86400",
        "x-registry-key-id": registryKeyId || "unknown",
        "x-ratelimit-limit": "60",
        "x-ratelimit-remaining": rateLimitResult.remaining.toString(),
        "x-ratelimit-reset": new Date(rateLimitResult.resetTime).toISOString(),
        ...headers,
      },
    });

    perfLogger.logSummary();

    // Enhanced analytics metadata for 304 responses
    const logUserAgent = request.headers.get("user-agent") || "";
    const isBrowser =
      logUserAgent.includes("Mozilla") ||
      logUserAgent.includes("Chrome") ||
      logUserAgent.includes("Safari");
    const isBot =
      logUserAgent.includes("bot") ||
      logUserAgent.includes("crawler") ||
      logUserAgent.includes("spider");

    await getLogger().logRequest(request, response, startTime, {
      agentId,
      cacheHit: true, // 304 means cache hit
      cacheSource: source,
      cacheLatency: latency,
      region: request.cf?.colo || "unknown",
      cfRay: request.headers.get("cf-ray") || undefined,
      isBot,
      isBrowser,
    });
    return response;
  }
  perfLogger.end("CONDITIONAL_CHECK", {
    etag: etag?.substring(0, 20) + "...",
    ifNoneMatch: ifNoneMatch?.substring(0, 20) + "...",
  });

  // Return passport with optimized headers and cache metrics
  perfLogger.start("RESPONSE_CREATION");

  // Calculate detailed timing breakdown for Server-Timing header
  const totalDuration = Date.now() - startTime;
  const workerCpuTime = totalDuration - latency; // Approximate worker CPU time
  const region = request.cf?.colo || "UNKNOWN";

  // Build Server-Timing header with detailed breakdown
  const serverTimingParts = [
    `cache;desc="${source.toUpperCase()}"`,
    `worker;dur=${workerCpuTime.toFixed(1)}`,
    `kv;dur=${source === "l3" ? latency.toFixed(1) : "0"}`,
    `serialize;dur=1.0`, // Approximate serialization time
    `region;desc="${region}"`,
  ];

  // Determine cache status for aport-cache header
  const aportCacheStatus =
    source === "l1"
      ? "HIT"
      : source === "l2"
      ? "HIT"
      : source === "l3"
      ? "MISS"
      : "MISS";

  const response = new Response(serializedPassport, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control":
        "public, max-age=0, s-maxage=60, stale-while-revalidate=30, stale-if-error=86400",
      "server-timing": serverTimingParts.join(", "),
      etag: etag!,
      "x-registry-key-id": registryKeyId || "unknown",
      "x-cache-source": source,
      "x-cache-latency": latency.toString(),
      "aport-cache": aportCacheStatus,
      "x-ratelimit-limit": "60",
      "x-ratelimit-remaining": rateLimitResult.remaining.toString(),
      "x-ratelimit-reset": new Date(rateLimitResult.resetTime).toISOString(),
      ...headers,
    },
  });
  perfLogger.end("RESPONSE_CREATION", {
    status: 200,
    responseSize: serializedPassport.length,
    headersCount: Object.keys(response.headers).length,
  });

  perfLogger.log("REQUEST_COMPLETE", totalDuration, {
    totalDuration,
    source,
    cacheLatency: latency,
    passportSize: serializedPassport.length,
    success: true,
  });

  console.log(
    `Verify endpoint completed in ${totalDuration}ms for ${agentId} (source: ${registryKeyId})`
  );

  // Log all performance data once at the end
  perfLogger.logSummary();

  // Async logging to avoid blocking response with enhanced analytics metadata
  const logUserAgent = request.headers.get("user-agent") || "";
  const isBrowser =
    logUserAgent.includes("Mozilla") ||
    logUserAgent.includes("Chrome") ||
    logUserAgent.includes("Safari");
  const isBot =
    logUserAgent.includes("bot") ||
    logUserAgent.includes("crawler") ||
    logUserAgent.includes("spider");

  getLogger()
    .logRequest(request, response, startTime, {
      agentId,
      cacheHit: source !== "l3",
      cacheSource: source,
      cacheLatency: latency,
      region: request.cf?.colo || "unknown",
      cfRay: request.headers.get("cf-ray") || undefined,
      isBot,
      isBrowser,
    })
    .catch((error: any) => {
      console.error("Logging error:", error);
    });
  return response;
};

// buildPassportObject is now imported from serialization.ts for consistency
// ETag generation is handled by the tiered cache system
