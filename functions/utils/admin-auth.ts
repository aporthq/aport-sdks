/**
 * Admin authentication utilities
 * Handles admin token routing and platform admin detection
 */

import { Request } from "@cloudflare/workers-types";
import { AuthContext } from "../../types/auth";

export interface AdminAuthResult {
  isAdmin: boolean;
  auth?: AuthContext;
  error?: string;
  statusCode?: number;
}

/**
 * Check if request is from a platform admin
 * Platform admins can create/update passports for any owner
 */
export async function isPlatformAdmin(
  request: Request,
  env: any
): Promise<AdminAuthResult> {
  // Check for admin token in headers
  const adminToken = request.headers.get("X-Admin-Token");
  if (adminToken && adminToken === env.ADMIN_TOKEN) {
    return {
      isAdmin: true,
      // Create a mock admin context for admin token requests
      auth: {
        user: {
          user_id: "admin",
          email: "admin@system",
          name: "System Admin",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        session: {
          session_id: "admin_session",
          user_id: "admin",
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
        org_roles: {},
        platform_roles: ["registry_admin"],
      } as unknown as AuthContext,
    } as any;
  }

  // Check for platform admin role in JWT
  try {
    const authHeader = request.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      // This would need to be implemented with JWT verification
      // For now, return false
    }
  } catch (error) {
    // JWT verification failed
  }

  return {
    isAdmin: false,
    error: "Admin authentication required",
    statusCode: 401,
  };
}

/**
 * Determine if request should be treated as admin request
 * Admin requests bypass normal ownership checks
 */
export function shouldTreatAsAdminRequest(request: Request, env: any): boolean {
  const adminToken = request.headers.get("X-Admin-Token");
  return adminToken === env.ADMIN_TOKEN;
}

/**
 * Get effective owner ID for admin requests
 * Admin can specify any owner_id in request body
 */
export function getEffectiveOwnerId(
  requestBody: any,
  isAdmin: boolean,
  fallbackOwnerId: string
): string {
  if (isAdmin && requestBody.owner_id) {
    return requestBody.owner_id;
  }
  return fallbackOwnerId;
}
