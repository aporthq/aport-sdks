/**
 * Token Refresh Endpoint
 *
 * Handles JWT token refresh using refresh tokens.
 */

import { PagesFunction } from "@cloudflare/workers-types";
import { cors } from "../../utils/cors";
import { createLogger } from "../../utils/logger";
import { AuthEnv } from "../../../types/auth";
import {
  getRefreshToken,
  getUser,
  getSession,
  createJWT,
  createAuthCookies,
  deleteSession,
  createSession,
  getClientIP,
  getUserAgent,
} from "../../utils/auth";

/**
 * Handle CORS preflight requests
 * OPTIONS /api/auth/refresh
 */
export const onRequestOptions: PagesFunction<AuthEnv> = async ({ request }) => {
  const headers = cors(request);
  return new Response(null, { headers });
};

/**
 * Refresh JWT token
 * POST /auth/refresh
 */
export const onRequestPost: PagesFunction<AuthEnv> = async ({
  request,
  env,
}) => {
  const startTime = Date.now();
  const headers = cors(request);
  const logger = createLogger(env.ai_passport_registry);

  try {
    // Extract refresh token from cookie
    const cookieHeader = request.headers.get("Cookie");
    if (!cookieHeader) {
      const response = new Response(
        JSON.stringify({
          error: "no_refresh_token",
          message: "No refresh token provided",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    const cookieMap = cookieHeader.split(";").reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split("=");
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    const refreshTokenId = cookieMap.refresh_token;
    if (!refreshTokenId) {
      const response = new Response(
        JSON.stringify({
          error: "no_refresh_token",
          message: "No refresh token provided",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Get refresh token data
    const refreshData = await getRefreshToken(
      env.ai_passport_registry,
      refreshTokenId
    );
    if (!refreshData) {
      const response = new Response(
        JSON.stringify({
          error: "invalid_refresh_token",
          message: "Refresh token not found or expired",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Check if refresh token is expired
    if (new Date(refreshData.expires_at) < new Date()) {
      const response = new Response(
        JSON.stringify({
          error: "refresh_token_expired",
          message: "Refresh token has expired",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Get user data
    const user = await getUser(env.ai_passport_registry, refreshData.user_id);
    if (!user) {
      const response = new Response(
        JSON.stringify({
          error: "user_not_found",
          message: "User not found",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Get session data
    const session = await getSession(
      env.ai_passport_registry,
      refreshData.session_id
    );
    if (!session) {
      const response = new Response(
        JSON.stringify({
          error: "session_not_found",
          message: "Session not found",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Delete old refresh token
    await deleteSession(
      env.ai_passport_registry,
      refreshData.session_id,
      refreshTokenId
    );

    // Create new session and refresh token
    const { sessionId, refreshTokenId: newRefreshTokenId } =
      await createSession(
        env.ai_passport_registry,
        user,
        session.provider,
        getClientIP(request),
        getUserAgent(request),
        session.turnstile_verified
      );

    // Create new JWT
    const jwt = await createJWT(
      {
        sub: user.user_id,
        session_id: sessionId,
        provider: session.provider,
        assurance_level: user.assurance_level,
        turnstile_verified: session.turnstile_verified,
      },
      env.JWT_SECRET,
      900 // 15 minutes
    );

    // Create new cookies
    // Create cookies (detect local development)
    const isLocalDev =
      env.APP_BASE_URL && env.APP_BASE_URL.includes("localhost");
    const authCookies = createAuthCookies(
      jwt,
      newRefreshTokenId,
      isLocalDev ? ".localhost" : undefined, // Use .localhost for cross-port access
      !!isLocalDev
    );

    // Log refresh
    await logger.logAudit({
      type: "token_refreshed",
      user_id: user.user_id,
      session_id: sessionId,
      timestamp: new Date().toISOString(),
    });

    const response = new Response(
      JSON.stringify({
        ok: true,
        message: "Token refreshed successfully",
        expires_in: 900, // 15 minutes
        ...(isLocalDev && {
          access_token: jwt,
          refresh_token: newRefreshTokenId,
        }),
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": `${authCookies.accessToken}; ${authCookies.refreshToken}`,
          ...headers,
        },
      }
    );

    await logger.logRequest(request, response, startTime, {
      agentId: user.user_id,
    });
    return response;
  } catch (error) {
    console.error("Token refresh error:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to refresh token",
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
