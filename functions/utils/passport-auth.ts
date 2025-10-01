/**
 * Common authentication and authorization utilities for passport endpoints
 */

import { Request } from "@cloudflare/workers-types";
import { authMiddleware, AuthResult } from "./auth-middleware";
import {
  canUpdateOwnPassport,
  canSuspendSponsoredPassport,
  RBAC_ERRORS,
} from "./rbac-guards";
import { AuthContext, ApiKeyScope } from "../../types/auth";
import {
  isPlatformAdmin,
  shouldTreatAsAdminRequest,
  getEffectiveOwnerId,
} from "./admin-auth";

export interface PassportAuthOptions {
  requireAuth: boolean;
  allowApiKey?: boolean;
  requiredApiKeyScopes?: ApiKeyScope[];
}

export interface PassportAuthResult {
  success: boolean;
  auth?: AuthContext;
  error?: string;
  statusCode?: number;
}

/**
 * Authenticate request for passport operations
 * Supports both regular auth and admin token authentication
 */
export async function authenticatePassportRequest(
  request: Request,
  env: any,
  options: PassportAuthOptions
): Promise<PassportAuthResult> {
  // Check if this is an admin request first
  const isAdminRequest = shouldTreatAsAdminRequest(request, env);

  if (isAdminRequest) {
    const adminResult = await isPlatformAdmin(request, env);
    if (adminResult.isAdmin) {
      return {
        success: true,
        auth: adminResult.auth,
      };
    }
    return {
      success: false,
      error: adminResult.error || "Admin authentication failed",
      statusCode: adminResult.statusCode || 401,
    };
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
    };
  }

  return {
    success: true,
    auth: authResult.user,
  };
}

/**
 * Check if user can create/update a passport for the given owner
 */
export function canManagePassport(
  auth: AuthContext,
  ownerId: string,
  operation: "create" | "update" | "suspend"
): { allowed: boolean; error?: string; statusCode?: number } {
  // Platform admins can do anything
  if (auth.platform_roles.includes("registry_admin")) {
    return { allowed: true };
  }

  // Admin token requests are always allowed (handled by isPlatformAdmin)
  if (auth.user.user_id === "admin") {
    return { allowed: true };
  }

  // Check if user owns the passport (for user passports)
  if (ownerId.startsWith("ap_user_") && ownerId === auth.user.user_id) {
    return { allowed: true };
  }

  // Check if user is org admin for org passports
  if (ownerId.startsWith("ap_org_")) {
    const orgRoles = auth.org_roles[ownerId] || [];
    if (orgRoles.includes("org_admin") || orgRoles.includes("org_issuer")) {
      return { allowed: true };
    }
  }

  // Check if user can update their own passport
  if (operation === "update" && canUpdateOwnPassport(auth, ownerId)) {
    return { allowed: true };
  }

  // Check if user can suspend sponsored passport
  if (
    operation === "suspend" &&
    canSuspendSponsoredPassport(auth, ownerId, [])
  ) {
    return { allowed: true };
  }

  return {
    allowed: false,
    error: RBAC_ERRORS.CANNOT_ACCESS_RESOURCE,
    statusCode: 403,
  };
}

/**
 * Extract owner ID from request body or path
 */
export function extractOwnerId(request: any, pathParams?: any): string | null {
  // Try path parameter first (for /api/orgs/{id}/... endpoints)
  if (pathParams?.id) {
    return pathParams.id;
  }

  // Try request body
  if (request.owner_id) {
    return request.owner_id;
  }

  return null;
}
