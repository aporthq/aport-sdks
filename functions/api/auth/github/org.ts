/**
 * GitHub Organization OAuth Upgrade Endpoint
 *
 * Handles GitHub OAuth upgrade to read:org scope for organization membership verification.
 */

import { PagesFunction } from "@cloudflare/workers-types";
import { cors } from "../../../utils/cors";
import { createLogger } from "../../../utils/logger";
import { getAppBaseUrl, getBackendBaseUrl } from "../../../utils/email";
import { AuthEnv } from "../../../../types/auth";
import {
  createGitHubOrgAuthURL,
  getGitHubConfig,
  verifyTurnstileToken,
} from "../../../utils/github";
import { generateOAuthState, getClientIP } from "../../../utils/auth";

/**
 * Handle CORS preflight requests
 * OPTIONS /api/auth/github/org
 */
export const onRequestOptions: PagesFunction<AuthEnv> = async ({ request }) => {
  const headers = cors(request);
  return new Response(null, { headers });
};

/**
 * GitHub Organization OAuth upgrade initiation
 * GET /api/auth/github/org
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
    const orgLogin = url.searchParams.get("org"); // Optional: specific org to verify

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

    // Store state in KV with return URL, turnstile verification status, and org
    await env.ai_passport_registry.put(
      `oauth_state:${state}`,
      JSON.stringify({
        return_url: returnUrl,
        turnstile_verified: !!turnstileToken,
        org_login: orgLogin,
        purpose: "org_verification",
        created_at: new Date().toISOString(),
      }),
      {
        expirationTtl: 600, // 10 minutes
      }
    );

    // Create GitHub OAuth URL with org scope
    const config = getGitHubConfig(env);
    // Use the same callback URL as regular GitHub auth
    const orgConfig = {
      ...config,
      redirectUri: `${getBackendBaseUrl(env)}/api/auth/github/callback`,
    };
    const authURL = createGitHubOrgAuthURL(orgConfig, state);

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
    console.error("GitHub Org OAuth initiation error:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to initiate GitHub Org OAuth",
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
