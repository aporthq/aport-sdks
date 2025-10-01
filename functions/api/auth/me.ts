/**
 * Get Current User Endpoint
 *
 * Returns the current authenticated user's information.
 */

import { PagesFunction } from "@cloudflare/workers-types";
import { cors } from "../../utils/cors";
import { createLogger } from "../../utils/logger";
import { AuthEnv } from "../../../types/auth";
import { authMiddleware } from "../../utils/auth-middleware";

/**
 * /api/auth/me:
 *   get:
 *     summary: Get current user information
 *     description: Returns the current authenticated user's information. Supports both JWT and API key authentication.
 *     operationId: getCurrentUser
 *     tags:
 *       - Authentication
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: User information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     user_id:
 *                       type: string
 *                       example: "ap_user_12345678"
 *                     email:
 *                       type: string
 *                       example: "user@example.com"
 *                     github_login:
 *                       type: string
 *                       example: "username"
 *                     display_name:
 *                       type: string
 *                       example: "John Doe"
 *                     assurance_level:
 *                       type: string
 *                       enum: [L0, L1, L2, L3, L4KYC, L4FIN]
 *                       example: "L1"
 *                     last_login_at:
 *                       type: string
 *                       format: date-time
 *                 session:
 *                   type: object
 *                   properties:
 *                     provider:
 *                       type: string
 *                       example: "github"
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     last_used_at:
 *                       type: string
 *                       format: date-time
 *                     turnstile_verified:
 *                       type: boolean
 *                 org_roles:
 *                   type: object
 *                 platform_roles:
 *                   type: array
 *                   items:
 *                     type: string
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Internal server error
 */

/**
 * Handle CORS preflight requests
 * OPTIONS /api/auth/me
 */
export const onRequestOptions: PagesFunction<AuthEnv> = async ({ request }) => {
  const headers = cors(request);
  return new Response(null, { headers });
};

/**
 * Get current user
 * GET /api/auth/me
 */
export const onRequestGet: PagesFunction<AuthEnv> = async ({
  request,
  env,
}) => {
  const startTime = Date.now();
  const headers = cors(request);
  const logger = createLogger(env.ai_passport_registry);

  try {
    // Use auth middleware to verify the request (allow both JWT and API key)
    const authResult = await authMiddleware(request, env, {
      requireAuth: true,
      allowApiKey: true,
      requiredApiKeyScopes: ["read"],
    });

    if (!authResult.success) {
      const response = new Response(
        JSON.stringify({
          error: authResult.error || "Authentication failed",
        }),
        {
          status: authResult.statusCode || 401,
          headers: { "Content-Type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Return user information
    const response = new Response(
      JSON.stringify({
        user: {
          user_id: authResult.user!.user.user_id,
          email: authResult.user!.user.email,
          github_login: authResult.user!.user.github_login,
          display_name: authResult.user!.user.display_name,
          assurance_level: authResult.user!.user.assurance_level,
          last_login_at: authResult.user!.user.last_login_at,
        },
        session: {
          provider: authResult.user!.session.provider,
          created_at: authResult.user!.session.created_at,
          last_used_at: authResult.user!.session.last_used_at,
          turnstile_verified: authResult.user!.session.turnstile_verified,
        },
        org_roles: authResult.user!.org_roles,
        platform_roles: authResult.user!.platform_roles,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...headers },
      }
    );

    await logger.logRequest(request, response, startTime, {
      agentId: authResult.user!.user.user_id,
    });
    return response;
  } catch (error) {
    console.error("Get current user error:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to get user information",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...headers },
      }
    );

    await logger.logRequest(request, response, startTime);
    return response;
  }
};
