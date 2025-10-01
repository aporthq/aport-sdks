/**
 * Logout Endpoint
 *
 * Handles user logout and session invalidation.
 */

import { PagesFunction } from "@cloudflare/workers-types";
import { cors } from "../../utils/cors";
import { createLogger } from "../../utils/logger";
import { AuthEnv } from "../../../types/auth";
import {
  verifyJWT,
  getRefreshToken,
  deleteSession,
  clearAuthCookies,
} from "../../utils/auth";

/**
 * Handle CORS preflight requests
 * OPTIONS /api/auth/logout
 */
export const onRequestOptions: PagesFunction<AuthEnv> = async ({ request }) => {
  const headers = cors(request);
  return new Response(null, { headers });
};

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
 * Extract refresh token from request
 */
function extractRefreshToken(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";").reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split("=");
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

  return cookies.refresh_token || null;
}

/**
 * Logout user
 * POST /auth/logout
 */
export const onRequestPost: PagesFunction<AuthEnv> = async ({
  request,
  env,
}) => {
  const startTime = Date.now();
  const headers = cors(request);
  const logger = createLogger(env.ai_passport_registry);

  try {
    // Extract tokens
    const accessToken = extractJWTToken(request);
    const refreshTokenId = extractRefreshToken(request);

    let userId: string | null = null;

    // If we have an access token, verify it to get user ID
    if (accessToken) {
      const payload = await verifyJWT(accessToken, env.JWT_SECRET);
      if (payload) {
        userId = payload.sub;
      }
    }

    // If we have a refresh token, get user ID from it
    if (!userId && refreshTokenId) {
      const refreshData = await getRefreshToken(
        env.ai_passport_registry,
        refreshTokenId
      );
      if (refreshData) {
        userId = refreshData.user_id;
      }
    }

    // If we have a user ID, clean up their session
    if (userId) {
      // Get refresh token data to find session ID
      if (refreshTokenId) {
        const refreshData = await getRefreshToken(
          env.ai_passport_registry,
          refreshTokenId
        );
        if (refreshData) {
          await deleteSession(
            env.ai_passport_registry,
            refreshData.session_id,
            refreshTokenId
          );
        }
      }

      // Log logout
      await logger.logAudit({
        type: "logout",
        user_id: userId,
        timestamp: new Date().toISOString(),
      });
    }

    // Clear cookies
    const cookies = clearAuthCookies();

    const response = new Response(
      JSON.stringify({
        ok: true,
        message: "Logged out successfully",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": `${cookies.accessToken}; ${cookies.refreshToken}`,
          ...headers,
        },
      }
    );

    await logger.logRequest(request, response, startTime, {
      agentId: userId || undefined,
    });
    return response;
  } catch (error) {
    console.error("Logout error:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to logout",
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
