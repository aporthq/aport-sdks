/**
 * General Authentication and Authorization Utilities
 *
 * Scalable authentication system for any endpoint that needs:
 * - JWT authentication
 * - API key authentication
 * - Admin token authentication
 * - Role-based access control
 * - Resource ownership validation
 */

import { Request } from "@cloudflare/workers-types";
import { authMiddleware, AuthResult } from "./auth-middleware";
import {
  canUpdateOwnPassport,
  canSuspendSponsoredPassport,
  hasOrgRole,
  hasPlatformRole,
  RBAC_ERRORS,
} from "./rbac-guards";
import { AuthContext, ApiKeyScope } from "../../types/auth";
import {
  isPlatformAdmin,
  shouldTreatAsAdminRequest,
  getEffectiveOwnerId,
} from "./admin-auth";

export interface GeneralAuthOptions {
  requireAuth: boolean;
  allowApiKey?: boolean;
  requiredApiKeyScopes?: ApiKeyScope[];
  requiredOrgRoles?: string[];
  requiredPlatformRoles?: string[];
  allowAdminToken?: boolean;
}

export interface GeneralAuthResult {
  success: boolean;
  auth?: AuthContext;
  error?: string;
  statusCode?: number;
  isAdmin?: boolean;
}

export interface ResourceAuthOptions {
  resourceOwnerId: string;
  operation: "create" | "read" | "update" | "delete" | "suspend" | "manage";
  allowSelfAccess?: boolean;
  allowOrgAccess?: boolean;
  allowAdminAccess?: boolean;
}

export interface ResourceAuthResult {
  allowed: boolean;
  error?: string;
  statusCode?: number;
  reason?: string;
}

/**
 * General authentication for any endpoint
 * Supports JWT, API key, and admin token authentication
 */
export async function authenticateRequest(
  request: Request,
  env: any,
  options: GeneralAuthOptions
): Promise<GeneralAuthResult> {
  // Check if this is an admin request first
  if (options.allowAdminToken) {
    const isAdminRequest = shouldTreatAsAdminRequest(request, env);

    if (isAdminRequest) {
      const adminResult = await isPlatformAdmin(request, env);
      if (adminResult.isAdmin) {
        return {
          success: true,
          auth: adminResult.auth,
          isAdmin: true,
        };
      }
      return {
        success: false,
        error: adminResult.error || "Admin authentication failed",
        statusCode: adminResult.statusCode || 401,
        isAdmin: false,
      };
    }
  }

  // Regular authentication
  const authResult = await authMiddleware(request, env, {
    requireAuth: options.requireAuth,
    allowApiKey: options.allowApiKey,
    requiredApiKeyScopes: options.requiredApiKeyScopes,
  });

  if (!authResult.success) {
    return {
      success: false,
      error: authResult.error,
      statusCode: authResult.statusCode || 401,
      isAdmin: false,
    };
  }

  // Check additional role requirements
  if (options.requiredOrgRoles && options.requiredOrgRoles.length > 0) {
    const hasRequiredOrgRole = options.requiredOrgRoles.some((role) =>
      hasOrgRole(authResult.user!, "any", [role as any])
    );
    if (!hasRequiredOrgRole) {
      return {
        success: false,
        error: "Insufficient organization role",
        statusCode: 403,
        isAdmin: false,
      };
    }
  }

  if (
    options.requiredPlatformRoles &&
    options.requiredPlatformRoles.length > 0
  ) {
    const hasRequiredPlatformRole = hasPlatformRole(
      authResult.user!,
      options.requiredPlatformRoles as any
    );
    if (!hasRequiredPlatformRole) {
      return {
        success: false,
        error: "Insufficient platform role",
        statusCode: 403,
        isAdmin: false,
      };
    }
  }

  return {
    success: true,
    auth: authResult.user,
    isAdmin: false,
  };
}

/**
 * Check if user can access a specific resource
 * Supports ownership, organization, and admin access patterns
 */
export function canAccessResource(
  auth: AuthContext,
  options: ResourceAuthOptions
): ResourceAuthResult {
  // Admin access (highest priority)
  if (
    options.allowAdminAccess &&
    auth.platform_roles.includes("registry_admin")
  ) {
    return { allowed: true, reason: "platform_admin" };
  }

  // Admin token access
  if (auth.user.user_id === "admin") {
    return { allowed: true, reason: "admin_token" };
  }

  // Self access (for user resources)
  if (
    options.allowSelfAccess &&
    options.resourceOwnerId === auth.user.user_id
  ) {
    return { allowed: true, reason: "self_access" };
  }

  // Organization access
  if (options.allowOrgAccess && options.resourceOwnerId.startsWith("ap_org_")) {
    const orgRoles = auth.org_roles[options.resourceOwnerId] || [];

    // Check for appropriate role based on operation
    const requiredRoles = getRequiredRolesForOperation(options.operation);
    const hasRequiredRole = requiredRoles.some((role) =>
      orgRoles.includes(role as any)
    );

    if (hasRequiredRole) {
      return { allowed: true, reason: "org_member" };
    }
  }

  // Special passport operations
  if (options.operation === "update" && options.allowSelfAccess) {
    if (canUpdateOwnPassport(auth, options.resourceOwnerId)) {
      return { allowed: true, reason: "own_passport" };
    }
  }

  if (options.operation === "suspend" && options.allowOrgAccess) {
    if (canSuspendSponsoredPassport(auth, options.resourceOwnerId, [])) {
      return { allowed: true, reason: "sponsor_org" };
    }
  }

  return {
    allowed: false,
    error: RBAC_ERRORS.CANNOT_ACCESS_RESOURCE,
    statusCode: 403,
  };
}

/**
 * Get required roles for a specific operation
 */
function getRequiredRolesForOperation(operation: string): string[] {
  switch (operation) {
    case "create":
      return ["org_admin", "org_issuer"];
    case "read":
      return ["org_admin", "org_issuer", "org_member"];
    case "update":
      return ["org_admin", "org_issuer"];
    case "delete":
      return ["org_admin"];
    case "suspend":
      return ["org_admin"];
    case "manage":
      return ["org_admin"];
    default:
      return ["org_admin"];
  }
}

/**
 * Extract owner ID from request body or path parameters
 */
export function extractOwnerId(
  requestBody: any,
  pathParams?: any
): string | null {
  // Try path parameter first (for /api/orgs/{id}/... endpoints)
  if (pathParams?.id) {
    return pathParams.id;
  }

  // Try request body
  if (requestBody.owner_id) {
    return requestBody.owner_id;
  }

  return null;
}

/**
 * Create a standardized error response
 */
export function createAuthErrorResponse(
  error: string,
  statusCode: number,
  requestId: string
): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error,
      requestId,
    }),
    {
      status: statusCode,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-Admin-Token",
      },
    }
  );
}

/**
 * Create a standardized success response
 */
export function createSuccessResponse(
  data: any,
  requestId: string,
  statusCode: number = 200
): Response {
  return new Response(
    JSON.stringify({
      success: true,
      data,
      requestId,
    }),
    {
      status: statusCode,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-Admin-Token",
      },
    }
  );
}
