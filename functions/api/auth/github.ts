/**
 * GitHub OAuth Authentication Endpoints
 *
 * Handles GitHub OAuth login flow and callbacks.
 */

import { PagesFunction } from "@cloudflare/workers-types";
import { cors } from "../../utils/cors";
import { createLogger } from "../../utils/logger";
import { getAppBaseUrl } from "../../utils/email";
import { AuthEnv } from "../../../types/auth";
import {
  createGitHubAuthURL,
  validateGitHubCallback,
  exchangeCodeForToken,
  getGitHubUserData,
  getGitHubUserEmails,
  getGitHubConfig,
  createUserIdFromGitHub,
  generateDisplayName,
  hasVerifiedEmail,
  verifyTurnstileToken,
} from "../../utils/github";
import {
  createOrUpdateUser,
  createSession,
  createJWT,
  createAuthCookies,
  generateOAuthState,
  verifyOAuthState,
  getClientIP,
  getUserAgent,
} from "../../utils/auth";

/**
 * Handle CORS preflight requests
 * OPTIONS /api/auth/github
 */
export const onRequestOptions: PagesFunction<AuthEnv> = async ({ request }) => {
  const headers = cors(request);
  return new Response(null, { headers });
};

/**
 * GitHub OAuth login initiation
 * GET /auth/github
 */
export const onRequestGet: PagesFunction<AuthEnv> = async ({
  request,
  env,
}) => {
  const startTime = Date.now();
  const headers = cors(request);
  const logger = createLogger(env.ai_passport_registry);

  try {
    const url = new URL(request.url);
    const returnUrl = url.searchParams.get("return_url") || getAppBaseUrl(env);
    const turnstileToken = url.searchParams.get("turnstile_token");

    // Verify Turnstile token if provided
    if (turnstileToken && env.TURNSTILE_SECRET_KEY) {
      const turnstileResult = await verifyTurnstileToken(
        turnstileToken,
        env.TURNSTILE_SECRET_KEY,
        getClientIP(request)
      );

      if (!turnstileResult.success) {
        const response = new Response(
          JSON.stringify({
            error: "Turnstile verification failed",
            error_codes: turnstileResult.error_codes,
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...headers },
          }
        );

        await logger.logRequest(request, response, startTime);
        return response;
      }
    }

    // Generate state parameter for CSRF protection
    const state = generateOAuthState();

    // Store state in KV with return URL and turnstile verification status
    await env.ai_passport_registry.put(
      `oauth_state:${state}`,
      JSON.stringify({
        return_url: returnUrl,
        turnstile_verified: !!turnstileToken,
        created_at: new Date().toISOString(),
      }),
      {
        expirationTtl: 900, // 15 minutes (increased from 10)
      }
    );

    // Create GitHub OAuth URL
    const config = getGitHubConfig(env);
    const authURL = createGitHubAuthURL(config, state);

    // Redirect to GitHub
    const response = new Response(null, {
      status: 302,
      headers: {
        Location: authURL,
        ...headers,
      },
    });

    await logger.logRequest(request, response, startTime);
    return response;
  } catch (error) {
    console.error("GitHub OAuth initiation error:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to initiate GitHub OAuth",
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
