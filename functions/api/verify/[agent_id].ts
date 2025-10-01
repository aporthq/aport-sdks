/**
 * @swagger
 * /api/verify/{agent_id}:
 *   get:
 *     summary: Verify agent passport
 *     description: Hot path verification with KV-only reads, multi-region/multi-tenant support, and comprehensive performance monitoring. Returns passport data with caching and high availability.
 *     operationId: verifyAgentPassport
 *     tags:
 *       - Verification
 *       - Passports
 *     parameters:
 *       - name: agent_id
 *         in: path
 *         required: true
 *         description: The unique identifier of the agent passport to verify
 *         schema:
 *           type: string
 *           pattern: "^ap_[a-zA-Z0-9]+$"
 *           example: "aeebc92d-13fb-4e23-8c3c-1aa82b167da6"
 *       - name: include_attestation
 *         in: query
 *         description: Include verifiable attestation data
 *         schema:
 *           type: boolean
 *           default: false
 *       - name: include_audit_trail
 *         in: query
 *         description: Include audit trail information
 *         schema:
 *           type: boolean
 *           default: false
 *       - name: cache_control
 *         in: query
 *         description: Cache control preference
 *         schema:
 *           type: string
 *           enum: ["no-cache", "max-age", "stale-while-revalidate"]
 *           default: "max-age"
 *     responses:
 *       200:
 *         description: Passport verification successful
 *         headers:
 *           Server-Timing:
 *             description: Performance timing information
 *             schema:
 *               type: string
 *               example: "kv-read;dur=45, cache-hit;dur=2, total;dur=47"
 *           ETag:
 *             description: Entity tag for caching
 *             schema:
 *               type: string
 *               example: 'W/"aeebc92d-13fb-4e23-8c3c-1aa82b167da6_2025-01-16T10:30:00Z_v1.0"'
 *           Cache-Control:
 *             description: Cache control directives
 *             schema:
 *               type: string
 *               example: "public, max-age=300, stale-while-revalidate=60"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - success
 *                 - data
 *                 - requestId
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Passport'
 *                 requestId:
 *                   type: string
 *                   description: Unique request identifier
 *                   example: "verify_123456789_abc123"
 *                 performance:
 *                   type: object
 *                   description: Performance metrics
 *                   properties:
 *                     total_time_ms:
 *                       type: number
 *                       example: 47
 *                     cache_hit:
 *                       type: boolean
 *                       example: true
 *                     cache_level:
 *                       type: string
 *                       example: "L1"
 *                     kv_read_time_ms:
 *                       type: number
 *                       example: 45
 *                 attestation:
 *                   type: object
 *                   description: Verifiable attestation data (if requested)
 *                   properties:
 *                     hash:
 *                       type: string
 *                       example: "sha256:abc123def456"
 *                     signature:
 *                       type: string
 *                       example: "ed25519:xyz789"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-01-16T10:30:00Z"
 *                 audit_trail:
 *                   type: array
 *                   description: Audit trail entries (if requested)
 *                   items:
 *                     type: object
 *                     properties:
 *                       action:
 *                         type: string
 *                         example: "passport_verified"
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-01-16T10:30:00Z"
 *                       details:
 *                         type: object
 *                         additionalProperties: true
 *       304:
 *         description: Not modified - passport unchanged
 *         headers:
 *           ETag:
 *             description: Entity tag for caching
 *             schema:
 *               type: string
 *               example: 'W/"aeebc92d-13fb-4e23-8c3c-1aa82b167da6_2025-01-16T10:30:00Z_v1.0"'
 *       400:
 *         description: Bad request - invalid agent ID
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "invalid_agent_id"
 *               message: "Agent ID must match pattern ap_[a-zA-Z0-9]+"
 *       404:
 *         description: Passport not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "passport_not_found"
 *               message: "Passport with ID aeebc92d-13fb-4e23-8c3c-1aa82b167da6 not found"
 *       429:
 *         description: Too many requests - rate limit exceeded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "rate_limit_exceeded"
 *               message: "Too many requests, please try again later"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "internal_server_error"
 *               message: "An unexpected error occurred"
 *       503:
 *         description: Service unavailable - high availability fallback failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "service_unavailable"
 *               message: "All verification services are temporarily unavailable"
 */

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
import {
  resolveTenantFromOrgId,
  resolveTenantBindings,
} from "../../runtime/region";
import { KVResolver, getKVForOwner } from "../../utils/kv-resolver";

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
 * R2 snapshot fallback for high availability with timeout and retry
 */
async function tryR2SnapshotFallback(
  r2Bucket: R2Bucket,
  agentId: string,
  version: string,
  timeoutMs: number = 2000
): Promise<any> {
  const startTime = performance.now();

  try {
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("R2 timeout")), timeoutMs);
    });

    // Try to get passport snapshot from R2 with timeout
    const snapshotKey = `passports/${agentId}/latest.json`;
    const snapshotPromise = r2Bucket.get(snapshotKey);

    const snapshot = await Promise.race([snapshotPromise, timeoutPromise]);

    if (!snapshot) {
      return null;
    }

    // Validate snapshot data
    const passportData = await snapshot.json();
    if (!passportData || typeof passportData !== "object") {
      console.warn("R2 snapshot contains invalid data", { agentId });
      return null;
    }

    // Validate required fields
    if (
      !(passportData as any).agent_id ||
      !(passportData as any).updated_at ||
      !(passportData as any).version
    ) {
      console.warn("R2 snapshot missing required fields", { agentId });
      return null;
    }

    const passport = buildPassportObject(passportData as PassportData, version);
    const etag = generateETag(passport);

    return {
      passport,
      etag,
      source: "r2",
      latency: performance.now() - startTime,
      fromCache: false,
    };
  } catch (error) {
    // Silent fail for performance
    console.warn("R2 fallback failed", {
      error: error instanceof Error ? error.message : String(error),
      agentId,
      timeout: timeoutMs,
    });
    return null;
  }
}

/**
 * Create comprehensive error response
 */
function createErrorResponse(
  errorCode: string,
  message: string,
  status: number,
  requestId: string,
  corsHeaders: Record<string, string>,
  additionalHeaders: Record<string, string> = {}
): Response {
  return new Response(
    JSON.stringify({
      error: errorCode,
      message,
      requestId,
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
        ...additionalHeaders,
      },
    }
  );
}

/**
 * Create comprehensive success response with analytics
 */
function createSuccessResponse(
  data: any,
  etag: string,
  source: string,
  latency: number,
  totalLatency: number,
  corsHeaders: Record<string, string>,
  additionalHeaders: Record<string, string> = {}
): Response {
  const region = "UNKNOWN"; // Could be extracted from request.cf?.colo
  const registryKeyId = `cache-${source}`;
  const aportCacheStatus = source === "l1" || source === "l2" ? "HIT" : "MISS";

  // Build comprehensive Server-Timing header
  const serverTimingParts = [
    `cache;desc="${source.toUpperCase()}"`,
    `worker;dur=${(totalLatency - latency).toFixed(1)}`,
    `kv;dur=${source === "l3" || source === "r2" ? latency.toFixed(1) : "0"}`,
    `serialize;dur=1.0`,
    `region;desc="${region}"`,
  ];

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control":
        "public, max-age=0, s-maxage=60, stale-while-revalidate=30, stale-if-error=86400",
      "Server-Timing": serverTimingParts.join(", "),
      ETag: etag,
      "X-Registry-Key-ID": registryKeyId,
      "X-Cache-Source": source,
      "X-Cache-Latency": latency.toString(),
      "Aport-Cache": aportCacheStatus,
      ...corsHeaders,
      ...additionalHeaders,
    },
  });
}

/**
 * Fallback direct KV lookup when tiered cache fails
 */
async function tryDirectKVLookup(
  kv: KVNamespace,
  agentId: string,
  version: string
): Promise<any> {
  const startTime = performance.now();

  try {
    // Try direct passport key first
    const passportKey = `passport:${agentId}`;
    const passportData = await kv.get(passportKey, "json");

    if (passportData && typeof passportData === "object") {
      const passport = buildPassportObject(
        passportData as PassportData,
        version
      );
      const etag = generateETag(passport);

      return {
        passport,
        etag,
        source: "l3", // KV is L3 cache
        latency: performance.now() - startTime,
        fromCache: false,
      };
    }

    // Try serialized passport key (same as old endpoint)
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
        source: "l3",
        latency: performance.now() - startTime,
        fromCache: false,
      };
    }

    return null;
  } catch (error) {
    // Silent fail for performance
    return null;
  }
}

/**
 * Validate and sanitize agent ID
 */
function validateAgentId(agentId: string): {
  valid: boolean;
  normalized?: string;
  error?: string;
} {
  if (!agentId || typeof agentId !== "string") {
    return { valid: false, error: "Agent ID must be a string" };
  }

  const trimmed = agentId.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: "Agent ID cannot be empty" };
  }

  if (trimmed.length > 100) {
    return { valid: false, error: "Agent ID too long (max 100 characters)" };
  }

  // No UUID validation needed - accept any valid string

  return { valid: true, normalized: trimmed };
}

/**
 * Create KV resolver for multi-region/multi-tenant support with caching
 */
const kvResolverCache = new Map<string, any>();

function createKVResolver(env: any) {
  // Cache KV resolver to avoid recreating every request
  const cacheKey = "kv-resolver";
  if (kvResolverCache.has(cacheKey)) {
    return kvResolverCache.get(cacheKey);
  }

  const kvResolver = new KVResolver(env);
  const resolver = {
    getAgentInfo: async (agentId: string) => {
      // First operation: kv.get('agent_info:' + agent_id, 'json')
      // Use default KV for agent_info lookup (it's global)
      const agentInfoKey = `agent_info:${agentId}`;
      return await env.ai_passport_registry.get(agentInfoKey, "json");
    },
    getPassport: async (agentId: string, region?: string, ownerId?: string) => {
      // Get the appropriate KV based on region or owner
      let kv: KVNamespace;

      if (region) {
        kv = kvResolver.getKVForRegion(region);
      } else if (ownerId) {
        kv = await kvResolver.getKVForOwner(ownerId);
      } else {
        kv = env.ai_passport_registry; // fallback
      }

      // Try passport key first
      const passportKey = `passport:${agentId}`;
      const passportData = await kv.get(passportKey, "json");

      if (passportData && typeof passportData === "object") {
        return passportData;
      }

      // Try serialized passport key
      const serializedKey = `passport_serialized:${agentId}`;
      const serializedData = await kv.get(serializedKey, "json");

      if (
        serializedData &&
        typeof serializedData === "object" &&
        "json" in serializedData
      ) {
        return (serializedData as { json: any }).json;
      }

      return null;
    },
    getVerifyView: async (
      agentId: string,
      region?: string,
      ownerId?: string
    ) => {
      // Get the appropriate KV based on region or owner
      let kv: KVNamespace;

      if (region) {
        kv = kvResolver.getKVForRegion(region);
      } else if (ownerId) {
        kv = await kvResolver.getKVForOwner(ownerId);
      } else {
        kv = env.ai_passport_registry; // fallback
      }

      const verifyKey = `verify_view:${agentId}`;
      return await kv.get(verifyKey, "json");
    },
  };

  kvResolverCache.set(cacheKey, resolver);
  return resolver;
}

/**
 * Tenant resolution cache to avoid repeated lookups
 */
const tenantCache = new Map<
  string,
  { kv: KVNamespace; region: string; expires: number }
>();
const TENANT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 1000; // Prevent memory leaks

/**
 * Clean up expired cache entries
 */
function cleanupCache() {
  const now = Date.now();
  for (const [key, value] of tenantCache.entries()) {
    if (value.expires < now) {
      tenantCache.delete(key);
    }
  }

  // If cache is too large, remove oldest entries
  if (tenantCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(tenantCache.entries());
    entries.sort((a, b) => a[1].expires - b[1].expires);
    const toRemove = entries.slice(0, Math.floor(MAX_CACHE_SIZE / 2));
    toRemove.forEach(([key]) => tenantCache.delete(key));
  }
}

async function getTenantKV(
  env: any,
  ownerId: string,
  region: string
): Promise<KVNamespace> {
  // Clean up cache periodically
  if (Math.random() < 0.1) {
    // 10% chance to cleanup
    cleanupCache();
  }

  const cacheKey = `${ownerId}:${region}`;
  const cached = tenantCache.get(cacheKey);

  if (cached && cached.expires > Date.now()) {
    return cached.kv;
  }

  try {
    const tenant = await resolveTenantFromOrgId(env, ownerId);
    const bindings = resolveTenantBindings(env, tenant);

    tenantCache.set(cacheKey, {
      kv: bindings.kv,
      region: bindings.region || region,
      expires: Date.now() + TENANT_CACHE_TTL,
    });

    return bindings.kv;
  } catch (error) {
    console.warn("Failed to resolve tenant KV, using fallback", {
      error: error instanceof Error ? error.message : String(error),
      ownerId,
      region,
    });
    return env.ai_passport_registry;
  }
}

/**
 * @swagger
 * components:
 *   schemas:
 *     VerifyResponse:
 *       type: object
 *       properties:
 *         valid:
 *           type: boolean
 *           description: Whether the passport is valid
 *         passport:
 *           $ref: '#/components/schemas/Passport'
 *         verification_status:
 *           type: string
 *           enum: [verified, unverified, expired, revoked]
 *         etag:
 *           type: string
 *           description: ETag for caching
 *         source:
 *           type: string
 *           description: Data source (kv, cache, etc.)
 *         latency:
 *           type: number
 *           description: Response latency in ms
 *         cached:
 *           type: boolean
 *           description: Whether response was cached
 *         server_timing:
 *           type: string
 *           description: Server-Timing header value
 */

export const onRequest: PagesFunction<{
  ai_passport_registry: KVNamespace;
  ai_passport_assets: R2Bucket;
  PASSPORT_SNAPSHOTS_BUCKET?: R2Bucket;
  VERIFY_RPM?: string;
  AP_VERSION?: string;
}> = async ({ request, params, env }) => {
  const startTime = performance.now();
  const requestId = `verify_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 8)}`;
  const agentId = params?.agent_id as string;

  // CORS headers
  const corsHeaders = cors(request);

  // Enhanced performance monitoring
  const perfLogger = createPerformanceLogger(agentId || "unknown");
  perfLogger.start("REQUEST_START", {
    userAgent: request.headers.get("user-agent")?.substring(0, 50),
    ifNoneMatch: request.headers.get("if-none-match"),
    cfRay: request.headers.get("cf-ray"),
    region: (request as any).cf?.colo || "UNKNOWN",
  });

  // Enhanced logging setup
  const logger = createLogger(env.ai_passport_registry);
  const getLogger = () => logger;

  try {
    // Initialize components (remove duplicate logger creation)
    const cache = createCache(env.ai_passport_registry);
    const rateLimiter = createVerifyRateLimiter(env.ai_passport_registry);

    // Initialize KV resolver for multi-region/multi-tenant support
    const kvResolver = createKVResolver(env);

    // Parse query parameters for template support
    const url = new URL(request.url);
    const tenantRef = url.searchParams.get("tenant_ref") || undefined;
    const platformId = url.searchParams.get("platform_id") || undefined;
    const version = url.searchParams.get("version") || "1.0.0";

    perfLogger.start("PARAMS_PARSED");
    perfLogger.end("PARAMS_PARSED", { tenantRef, platformId, version });

    // Smart rate limiting with comprehensive browser detection - OPTIMIZED
    const userAgent = request.headers.get("user-agent") || "";
    const ifNoneMatch = request.headers.get("if-none-match");

    // Declare variables at function scope
    let rateLimitResult: {
      allowed: boolean;
      remaining: number;
      resetTime: number;
      retryAfter: number;
    } = {
      allowed: true,
      remaining: 60,
      resetTime: Date.now() + 60000,
      retryAfter: 60,
    };

    let isBrowserRequest = false;
    let isBot = false;

    // Early return for cached requests - skip rate limiting entirely
    if (ifNoneMatch) {
      perfLogger.end("RATE_LIMIT", {
        reason: "cached_request",
        ifNoneMatch: true,
      });
    } else {
      // Optimize browser detection with early returns
      isBrowserRequest =
        userAgent.includes("Mozilla") ||
        userAgent.includes("Chrome") ||
        userAgent.includes("Safari") ||
        userAgent.includes("Firefox") ||
        userAgent.includes("Edge");
      isBot =
        userAgent.includes("bot") ||
        userAgent.includes("crawler") ||
        userAgent.includes("spider") ||
        userAgent.includes("Bot");

      perfLogger.start("RATE_LIMIT");
      // Only rate limit non-browser requests
      if (!isBrowserRequest) {
        const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
        const limitResult = await rateLimiter.checkLimit(clientIP);
        rateLimitResult = {
          allowed: limitResult.allowed,
          remaining: limitResult.remaining,
          resetTime: limitResult.resetTime,
          retryAfter: limitResult.retryAfter || 60,
        };

        perfLogger.end("RATE_LIMIT", {
          clientIP,
          allowed: rateLimitResult.allowed,
          remaining: rateLimitResult.remaining,
          isBot,
        });
      } else {
        perfLogger.end("RATE_LIMIT", {
          reason: "browser_request",
          isBrowserRequest,
          isBot,
        });
      }

      if (!rateLimitResult.allowed) {
        perfLogger.log("RATE_LIMIT_BLOCKED", performance.now() - startTime, {
          retryAfter: rateLimitResult.retryAfter,
          remaining: rateLimitResult.remaining,
          clientIP: request.headers.get("CF-Connecting-IP") || "unknown",
        });

        const errorResponse = createErrorResponse(
          "rate_limit_exceeded",
          "Too many requests. Please try again later.",
          429,
          requestId,
          corsHeaders,
          {
            "Retry-After": rateLimitResult.retryAfter.toString(),
            "X-RateLimit-Limit": "60",
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": new Date(
              rateLimitResult.resetTime
            ).toISOString(),
          }
        );

        perfLogger.logSummary();
        await getLogger().logRequest(request, errorResponse, startTime, {
          agentId,
        });
        return errorResponse;
      }
    }

    // Enhanced validation with comprehensive error handling
    perfLogger.start("VALIDATION");
    const validation = validateAgentId(agentId);

    if (!validation.valid) {
      perfLogger.end("VALIDATION", {
        agentId,
        reason: "invalid_agent_id",
        error: validation.error,
      });

      const errorResponse = createErrorResponse(
        "invalid_agent_id",
        validation.error || "Invalid agent ID",
        400,
        requestId,
        corsHeaders
      );

      perfLogger.logSummary();
      await getLogger().logRequest(request, errorResponse, startTime, {
        agentId,
      });
      return errorResponse;
    }

    // Use validated and normalized agentId
    const normalizedAgentId = validation.normalized!;
    perfLogger.end("VALIDATION", { normalizedAgentId });

    // Enhanced performance timing
    const timing = {
      cacheLookup: 0,
      passportBuild: 0,
      regionResolution: 0,
      kvLookup: 0,
      r2Fallback: 0,
      directKVFallback: 0,
      total: 0,
    };

    // First operation: kv.get('agent_info:' + agent_id, 'json')
    perfLogger.start("AGENT_INFO_LOOKUP");
    const agentInfo = await kvResolver.getAgentInfo(normalizedAgentId);
    perfLogger.end("AGENT_INFO_LOOKUP", {
      found: !!agentInfo,
      region: agentInfo?.region,
    });

    // If agent_info missing → fail-closed (403 with agent_not_indexed)
    if (!agentInfo) {
      perfLogger.log("AGENT_NOT_INDEXED", performance.now() - startTime, {
        agentId: normalizedAgentId,
      });

      const errorResponse = createErrorResponse(
        "agent_not_indexed",
        "Agent not found in registry",
        403,
        requestId,
        corsHeaders
      );

      perfLogger.logSummary();
      await getLogger().logRequest(request, errorResponse, startTime, {
        agentId: normalizedAgentId,
      });
      return errorResponse;
    }

    // Get region and select tenant bindings
    const agentRegion = agentInfo.region || "US";
    const ownerId = agentInfo.owner_id;

    // Resolve tenant information for multi-tenant support with caching
    let tenantKV = env.ai_passport_registry; // fallback
    if (ownerId) {
      tenantKV = await getTenantKV(env, ownerId, agentRegion);
    }

    // Initialize tiered cache system
    const tieredCache = createTieredPassportCache(tenantKV);
    // Optimize cache key generation - pre-compute parts
    const cacheKey = `verify:${normalizedAgentId}:${version}:${agentRegion}:${
      ownerId || "default"
    }`;

    // Multi-level cache lookup with fallbacks
    let passportResult: any = null;
    const cacheStart = performance.now();

    // L1/L2/L3 Tiered Cache Lookup
    perfLogger.start("TIERED_CACHE_LOOKUP");
    try {
      passportResult = await tieredCache.getPassport(normalizedAgentId);
      timing.cacheLookup = performance.now() - cacheStart;
      perfLogger.end("TIERED_CACHE_LOOKUP", {
        found: !!passportResult,
        source: passportResult?.source,
        cacheLatency: passportResult?.latency,
      });
    } catch (error) {
      // Fallback to direct KV lookup if tiered cache fails
      perfLogger.start("DIRECT_KV_FALLBACK");
      passportResult = await tryDirectKVLookup(
        tenantKV,
        normalizedAgentId,
        version
      );
      timing.directKVFallback = performance.now() - cacheStart;
      perfLogger.end("DIRECT_KV_FALLBACK", {
        found: !!passportResult,
        source: passportResult?.source,
        latency: timing.directKVFallback,
      });
    }

    // If still not found, try R2 snapshot for high availability
    if (!passportResult && env.PASSPORT_SNAPSHOTS_BUCKET) {
      perfLogger.start("R2_FALLBACK");
      const r2Start = performance.now();
      try {
        passportResult = await tryR2SnapshotFallback(
          env.PASSPORT_SNAPSHOTS_BUCKET,
          normalizedAgentId,
          version
        );
        timing.r2Fallback = performance.now() - r2Start;
        perfLogger.end("R2_FALLBACK", {
          found: !!passportResult,
          latency: timing.r2Fallback,
        });
      } catch (error) {
        perfLogger.end("R2_FALLBACK", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Handle ETag matching for cached results
    if (passportResult && ifNoneMatch && passportResult.etag === ifNoneMatch) {
      perfLogger.log("ETAG_MATCH", performance.now() - startTime, {
        source: passportResult.source,
      });

      const notModifiedResponse = new Response(null, {
        status: 304,
        headers: {
          ETag: ifNoneMatch,
          "Cache-Control":
            "public, max-age=0, s-maxage=60, stale-while-revalidate=30, stale-if-error=86400",
          "X-Registry-Key-ID": `cache-${passportResult.source}`,
          "X-RateLimit-Limit": "60",
          "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
          "X-RateLimit-Reset": new Date(
            rateLimitResult.resetTime
          ).toISOString(),
          ...corsHeaders,
        },
      });

      perfLogger.logSummary();
      await getLogger().logRequest(request, notModifiedResponse, startTime, {
        agentId: normalizedAgentId,
        cacheHit: true,
        cacheSource: passportResult.source,
        cacheLatency: passportResult.latency,
        region: (request as any).cf?.colo || "unknown",
        cfRay: request.headers.get("cf-ray") || undefined,
        isBot,
        isBrowser: isBrowserRequest,
      });
      return notModifiedResponse;
    }

    // Return cached result if found - return passport directly like old implementation
    if (passportResult) {
      perfLogger.log("CACHE_HIT", performance.now() - startTime, {
        source: passportResult.source,
        latency: passportResult.latency,
      });

      // Handle both string and object passport data to prevent double-encoding
      const serializedPassport =
        typeof passportResult.passport === "string"
          ? passportResult.passport
          : JSON.stringify(passportResult.passport);

      const registryKeyId = `cache-${passportResult.source}`;
      const aportCacheStatus =
        passportResult.source === "l1" || passportResult.source === "l2"
          ? "HIT"
          : "MISS";
      const region = (request as any).cf?.colo || "UNKNOWN";

      // Build comprehensive Server-Timing header
      const serverTimingParts = [
        `cache;desc="${passportResult.source.toUpperCase()}"`,
        `worker;dur=${(
          performance.now() -
          startTime -
          passportResult.latency
        ).toFixed(1)}`,
        `kv;dur=${
          passportResult.source === "l3"
            ? passportResult.latency.toFixed(1)
            : "0"
        }`,
        `serialize;dur=1.0`,
        `region;desc="${region}"`,
      ];

      const response = new Response(serializedPassport, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control":
            "public, max-age=0, s-maxage=60, stale-while-revalidate=30, stale-if-error=86400",
          "Server-Timing": serverTimingParts.join(", "),
          ETag: passportResult.etag,
          "X-Registry-Key-ID": registryKeyId,
          "X-Cache-Source": passportResult.source,
          "X-Cache-Latency": passportResult.latency.toString(),
          "Aport-Cache": aportCacheStatus,
          "X-RateLimit-Limit": "60",
          "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
          "X-RateLimit-Reset": new Date(
            rateLimitResult.resetTime
          ).toISOString(),
          ...corsHeaders,
        },
      });

      perfLogger.logSummary();
      await getLogger().logRequest(request, response, startTime, {
        agentId: normalizedAgentId,
        cacheHit: true,
        cacheSource: passportResult.source,
        cacheLatency: passportResult.latency,
        region: (request as any).cf?.colo || "unknown",
        cfRay: request.headers.get("cf-ray") || undefined,
        isBot,
        isBrowser: isBrowserRequest,
      });
      return response;
    }

    // If no cached result, perform fresh KV lookup and build
    perfLogger.start("FRESH_KV_LOOKUP");
    const passportData = await kvResolver.getPassport(
      normalizedAgentId,
      agentRegion,
      ownerId
    );
    const verifyView = await kvResolver.getVerifyView(
      normalizedAgentId,
      agentRegion,
      ownerId
    );
    perfLogger.end("FRESH_KV_LOOKUP", {
      passportFound: !!passportData,
      verifyViewFound: !!verifyView,
      region: agentRegion,
      ownerId,
    });

    timing.kvLookup = performance.now() - startTime;

    if (!passportData) {
      perfLogger.log("PASSPORT_NOT_FOUND", performance.now() - startTime, {
        agentId: normalizedAgentId,
        region: agentRegion,
        ownerId,
      });

      const errorResponse = createErrorResponse(
        "not_found",
        "Agent passport not found",
        404,
        requestId,
        corsHeaders
      );

      perfLogger.logSummary();
      await getLogger().logRequest(request, errorResponse, startTime, {
        agentId: normalizedAgentId,
      });
      return errorResponse;
    }

    // Build passport object
    perfLogger.start("PASSPORT_BUILD");
    const passport = buildPassportObject(passportData as PassportData, version);
    const etag = generateETag(passport);
    perfLogger.end("PASSPORT_BUILD", {
      agentId: passport.agent_id,
      version: passport.version,
    });

    timing.passportBuild = performance.now() - startTime;

    // Determine verification status
    const verificationStatus = (verifyView as any)?.status || "unverified";
    const isValid =
      verificationStatus === "verified" && passport.status === "active";

    // Build response with enhanced timing - return passport directly like old implementation
    const totalLatency = performance.now() - startTime;
    const serializedPassport = JSON.stringify(passport);
    const registryKeyId = "cache-l3";
    const aportCacheStatus = "MISS";
    const region = (request as any).cf?.colo || "UNKNOWN";

    // Pre-warm the tiered cache with the fresh result
    try {
      await tieredCache.preWarmPassport(
        normalizedAgentId,
        passportData as PassportData
      );
    } catch (error) {
      console.warn("Failed to pre-warm cache", {
        error: error instanceof Error ? error.message : String(error),
        agentId: normalizedAgentId,
      });
    }

    // Record enhanced performance metrics
    recordVerifyPerformance(
      normalizedAgentId,
      "l3", // KV source
      timing.kvLookup,
      totalLatency,
      false // not cached
    );

    perfLogger.log("VERIFY_SUCCESS", totalLatency, {
      agentId: normalizedAgentId,
      region: agentRegion,
      ownerId,
      verificationStatus,
      isValid,
      cacheLatency: timing.cacheLookup,
      kvLatency: timing.kvLookup,
      buildLatency: timing.passportBuild,
      r2Latency: timing.r2Fallback,
      directKVLatency: timing.directKVFallback,
    });

    // Build comprehensive Server-Timing header
    const serverTimingParts = [
      `cache;desc="L3"`,
      `worker;dur=${(totalLatency - timing.kvLookup).toFixed(1)}`,
      `kv;dur=${timing.kvLookup.toFixed(1)}`,
      `serialize;dur=1.0`,
      `region;desc="${region}"`,
    ];

    const response = new Response(serializedPassport, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control":
          "public, max-age=0, s-maxage=60, stale-while-revalidate=30, stale-if-error=86400",
        "Server-Timing": serverTimingParts.join(", "),
        ETag: etag,
        "X-Registry-Key-ID": registryKeyId,
        "X-Cache-Source": "l3",
        "X-Cache-Latency": timing.kvLookup.toString(),
        "Aport-Cache": aportCacheStatus,
        "X-Request-ID": requestId,
        "X-RateLimit-Limit": "60",
        "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
        "X-RateLimit-Reset": new Date(rateLimitResult.resetTime).toISOString(),
        ...corsHeaders,
      },
    });

    perfLogger.logSummary();
    await getLogger().logRequest(request, response, startTime, {
      agentId: normalizedAgentId,
      cacheHit: false,
      cacheSource: "l3",
      cacheLatency: timing.kvLookup,
      region: (request as any).cf?.colo || "unknown",
      cfRay: request.headers.get("cf-ray") || undefined,
      isBot,
      isBrowser: isBrowserRequest,
    });
    return response;
  } catch (error) {
    const errorLatency = performance.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const agentIdForError = agentId || "unknown";

    perfLogger.log("VERIFY_ERROR", errorLatency, {
      error: errorMessage,
      agentId: agentIdForError,
    });

    recordVerifyError();

    const errorResponse = createErrorResponse(
      "internal_server_error",
      "Internal server error",
      500,
      requestId,
      corsHeaders
    );

    perfLogger.logSummary();
    await getLogger().logRequest(request, errorResponse, startTime, {
      agentId: agentIdForError,
    });
    return errorResponse;
  }
};
