/**
 * Authentication Middleware
 *
 * Handles JWT verification, session management, and role-based access control.
 */

import { Request } from "@cloudflare/workers-types";
import {
  AuthContext,
  JWTPayload,
  OrgRole,
  PlatformRole,
  ApiKeyScope,
} from "../../types/auth";
import { AuthEnv } from "../../types/auth";
import { verifyJWT, getUser, getSession, createAuthContext } from "./auth";
import { validateTokenFormat, isSuspiciousRequest } from "./security";
import { apiKeyAuthMiddleware, ApiKeyAuthResult } from "./api-key-auth";

export interface AuthMiddlewareOptions {
  requireAuth?: boolean;
  requiredRoles?: OrgRole[];
  requiredPlatformRoles?: PlatformRole[];
  requiredOrgId?: string;
  allowApiKey?: boolean;
  requiredApiKeyScopes?: ApiKeyScope[];
}

export interface AuthRequest extends Request {
  auth?: AuthContext;
}

/**
 * Authentication middleware result
 */
export interface AuthResult {
  success: boolean;
  user?: AuthContext;
  error?: string;
  statusCode?: number;
}

/**
 * Extract JWT token from request
 */
function extractJWTToken(request: Request): string | null {
  // Try Authorization header first
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  // Try cookie
  const cookieHeader = request.headers.get("Cookie");
  if (cookieHeader) {
    const cookies = cookieHeader.split(";").reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split("=");
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    return cookies.access_token || null;
  }

  return null;
}

/**
 * Check if user has required organization roles
 */
function hasOrgRole(
  userRoles: Record<string, OrgRole[]>,
  orgId: string,
  requiredRoles: OrgRole[]
): boolean {
  const userOrgRoles = userRoles[orgId] || [];
  return requiredRoles.some((role) => userOrgRoles.includes(role));
}

/**
 * Check if user has required platform roles
 */
function hasPlatformRole(
  userPlatformRoles: PlatformRole[],
  requiredRoles: PlatformRole[]
): boolean {
  return requiredRoles.some((role) => userPlatformRoles.includes(role));
}

/**
 * Main authentication middleware
 */
export async function authMiddleware(
  request: Request,
  env: AuthEnv,
  options: AuthMiddlewareOptions = {}
): Promise<AuthResult> {
  const {
    requireAuth = true,
    requiredRoles = [],
    requiredPlatformRoles = [],
    requiredOrgId,
    allowApiKey = false,
    requiredApiKeyScopes = [],
  } = options;

  // If auth is not required, return success
  if (!requireAuth) {
    return { success: true };
  }

  // Check for suspicious requests
  if (isSuspiciousRequest(request)) {
    return {
      success: false,
      error: "Request blocked for security reasons",
      statusCode: 403,
    };
  }

  // Check for admin token first (if allowed)
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${env.ADMIN_TOKEN}`) {
    // Admin token authentication - create admin context
    const adminAuthContext: AuthContext = {
      user: {
        user_id: "admin",
        email: "admin@system",
        display_name: "System Admin",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        assurance_level: "L3",
      },
      session: {
        user_id: "admin",
        provider: "admin_token" as any,
        created_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
        ip_address: request.headers.get("CF-Connecting-IP") || "unknown",
        user_agent: request.headers.get("User-Agent") || "unknown",
        turnstile_verified: false,
      },
      org_roles: {},
      platform_roles: ["registry_admin"],
    };

    return {
      success: true,
      user: adminAuthContext,
    };
  }

  // Try API key authentication first if allowed
  if (allowApiKey) {
    const apiKeyResult = await apiKeyAuthMiddleware(
      request,
      env.ai_passport_registry,
      requiredApiKeyScopes
    );

    if (apiKeyResult.success && apiKeyResult.apiKey) {
      // Create a minimal auth context for API key authentication
      const apiKeyAuthContext: AuthContext = {
        user: {
          user_id: apiKeyResult.apiKey.owner_id, // Use the actual owner ID, not the API key ID
          email: undefined,
          github_id: undefined,
          github_login: undefined,
          display_name:
            apiKeyResult.apiKey.name ||
            `API Key (${apiKeyResult.apiKey.key_id.substring(0, 8)}...)`,
          created_at: apiKeyResult.apiKey.created_at,
          updated_at: apiKeyResult.apiKey.created_at,
          assurance_level: "L0",
        },
        session: {
          user_id: `api_key:${apiKeyResult.apiKey.key_id}`,
          provider: "api_key" as any,
          created_at: apiKeyResult.apiKey.created_at,
          last_used_at: new Date().toISOString(),
          ip_address: request.headers.get("CF-Connecting-IP") || "unknown",
          user_agent: request.headers.get("User-Agent") || "unknown",
          turnstile_verified: false,
        },
        org_roles: {},
        platform_roles: [],
      };

      return {
        success: true,
        user: apiKeyAuthContext,
      };
    }
  }

  // Extract JWT token
  const token = extractJWTToken(request);
  if (!token) {
    return {
      success: false,
      error: "No authentication token provided",
      statusCode: 401,
    };
  }

  // Validate token format
  if (!validateTokenFormat(token)) {
    return {
      success: false,
      error: "Invalid token format",
      statusCode: 401,
    };
  }

  // Verify JWT token
  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload) {
    return {
      success: false,
      error: "Invalid or expired token",
      statusCode: 401,
    };
  }

  // Get user data
  const user = await getUser(env.ai_passport_registry, payload.sub);
  if (!user) {
    return {
      success: false,
      error: "User not found",
      statusCode: 401,
    };
  }

  // Get session data
  const sessionId = payload.session_id || payload.sub; // Use session_id if available, fallback to user_id
  const session = await getSession(env.ai_passport_registry, sessionId);
  if (!session) {
    return {
      success: false,
      error: "Session not found",
      statusCode: 401,
    };
  }

  // Create auth context
  const authContext = await createAuthContext(
    env.ai_passport_registry,
    user,
    session
  );

  // Check organization roles if required
  if (requiredRoles.length > 0) {
    if (!requiredOrgId) {
      return {
        success: false,
        error: "Organization ID required for role check",
        statusCode: 400,
      };
    }

    if (!hasOrgRole(authContext.org_roles, requiredOrgId, requiredRoles)) {
      return {
        success: false,
        error: "Insufficient organization permissions",
        statusCode: 403,
      };
    }
  }

  // Check platform roles if required
  if (requiredPlatformRoles.length > 0) {
    if (!hasPlatformRole(authContext.platform_roles, requiredPlatformRoles)) {
      return {
        success: false,
        error: "Insufficient platform permissions",
        statusCode: 403,
      };
    }
  }

  return {
    success: true,
    user: authContext,
  };
}

/**
 * Middleware for registry admin routes
 */
export async function requireRegistryAdmin(
  request: Request,
  env: AuthEnv
): Promise<AuthResult> {
  return authMiddleware(request, env, {
    requireAuth: true,
    requiredPlatformRoles: ["registry_admin"],
  });
}

/**
 * Middleware for organization admin routes
 */
export async function requireOrgAdmin(
  request: Request,
  env: AuthEnv,
  orgId: string
): Promise<AuthResult> {
  return authMiddleware(request, env, {
    requireAuth: true,
    requiredRoles: ["org_admin"],
    requiredOrgId: orgId,
  });
}

/**
 * Middleware for organization member routes
 */
export async function requireOrgMember(
  request: Request,
  env: AuthEnv,
  orgId: string
): Promise<AuthResult> {
  return authMiddleware(request, env, {
    requireAuth: true,
    requiredRoles: ["org_admin", "org_member"],
    requiredOrgId: orgId,
  });
}

/**
 * Middleware for organization issuer routes
 */
export async function requireOrgIssuer(
  request: Request,
  env: AuthEnv,
  orgId: string
): Promise<AuthResult> {
  return authMiddleware(request, env, {
    requireAuth: true,
    requiredRoles: ["org_issuer"],
    requiredOrgId: orgId,
  });
}

/**
 * Create authenticated request handler
 */
export function createAuthenticatedHandler<T extends AuthRequest>(
  handler: (
    request: T,
    env: AuthEnv,
    context: AuthContext
  ) => Promise<Response>,
  options: AuthMiddlewareOptions = {}
) {
  return async (request: T, env: AuthEnv): Promise<Response> => {
    const authResult = await authMiddleware(request, env, options);

    if (!authResult.success) {
      return new Response(
        JSON.stringify({
          error: authResult.error || "Authentication failed",
        }),
        {
          status: authResult.statusCode || 401,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Add auth context to request
    (request as any).auth = authResult.user;

    return handler(request, env, authResult.user!);
  };
}

/**
 * Check if request is authenticated
 */
export async function isAuthenticated(
  request: Request,
  env: AuthEnv
): Promise<boolean> {
  const result = await authMiddleware(request, env, { requireAuth: true });
  return result.success;
}

/**
 * Get current user from request (if authenticated)
 */
export async function getCurrentUser(
  request: Request,
  env: AuthEnv
): Promise<AuthContext | null> {
  const result = await authMiddleware(request, env, { requireAuth: true });
  return result.success ? result.user || null : null;
}

/**
 * Create error response for auth failures
 */
export function createAuthErrorResponse(
  error: string,
  statusCode: number = 401
): Response {
  return new Response(
    JSON.stringify({
      error,
      code: statusCode === 401 ? "unauthorized" : "forbidden",
    }),
    {
      status: statusCode,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

/**
 * Create success response with auth context
 */
export function createAuthSuccessResponse(
  data: any,
  authContext: AuthContext
): Response {
  return new Response(
    JSON.stringify({
      ...data,
      user: {
        user_id: authContext.user.user_id,
        email: authContext.user.email,
        github_login: authContext.user.github_login,
        display_name: authContext.user.display_name,
        assurance_level: authContext.user.assurance_level,
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}
