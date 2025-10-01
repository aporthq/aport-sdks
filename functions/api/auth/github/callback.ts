/**
 * GitHub OAuth Callback Endpoint
 *
 * Handles the callback from GitHub OAuth and creates user session.
 */

import { PagesFunction } from "@cloudflare/workers-types";
import { cors } from "../../../utils/cors";
import { createLogger } from "../../../utils/logger";
import { AuthEnv } from "../../../../types/auth";
import {
  validateGitHubCallback,
  exchangeCodeForToken,
  getGitHubUserData,
  getGitHubUserEmails,
  getGitHubConfig,
  createUserIdFromGitHub,
  generateDisplayName,
  hasVerifiedEmail,
  isGitHubTokenValid,
  createGitHubAuthURL,
} from "../../../utils/github";
import { getAppBaseUrl } from "../../../utils/email";
import {
  handleRegularGitHubAuth,
  handleGitHubOrgVerification,
  generateRegularAuthSuccessPage,
  generateOrgVerificationSuccessPage,
  GitHubAuthState,
} from "../../../utils/github-auth-handlers";

/**
 * Handle token expiration by redirecting to re-authentication
 */
async function handleTokenExpiration(
  env: AuthEnv,
  stateData: GitHubAuthState,
  headers: Record<string, string>
): Promise<Response> {
  // Generate new OAuth state for re-authentication
  const newState = crypto.randomUUID();
  const stateDataWithReauth = {
    ...stateData,
    isReauth: true, // Mark as re-authentication
  };

  // Store new state
  await env.ai_passport_registry.put(
    `oauth_state:${newState}`,
    JSON.stringify(stateDataWithReauth),
    { expirationTtl: 600 } // 10 minutes
  );

  // Create re-authentication URL with force consent
  const config = getGitHubConfig(env);
  const authUrl = createGitHubAuthURL(config, newState, true); // Force consent

  // Return HTML page that redirects to re-authentication
  const html = `
    <!DOCTYPE html>
    <html lang="en" class="dark">
    <head>
      <title>Re-authentication Required - Agent Passport</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <script src="https://cdn.tailwindcss.com"></script>
      <script>
        tailwind.config = {
          darkMode: 'class',
          theme: {
            extend: {
              colors: {
                passport: {
                  primary: '#06b6d4',
                  'primary-light': '#67e8f9',
                  'primary-dark': '#0891b2',
                  background: '#0f172a',
                  'background-dark': '#0f172a',
                  card: '#1e293b',
                  'card-dark': '#1e293b',
                  border: '#334155',
                  text: '#f1f5f9',
                  'text-light': '#f8fafc',
                  'text-muted': '#94a3b8',
                }
              }
            }
          }
        }
      </script>
    </head>
    <body class="min-h-screen bg-gradient-to-br from-passport-background via-passport-background to-slate-900 flex items-center justify-center">
      <div class="max-w-md w-full bg-passport-card rounded-lg shadow-passport-lg p-8 text-center border border-passport-border">
        <div class="mb-6">
          <div class="w-16 h-16 bg-yellow-900/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-yellow-500/20">
            <span class="text-4xl">🔐</span>
          </div>
          <h1 class="text-2xl font-bold text-passport-text mb-2">Re-authentication Required</h1>
          <p class="text-passport-text-muted">Your GitHub session has expired. Please re-authenticate to continue.</p>
        </div>
        <a href="${authUrl}" class="inline-flex items-center px-4 py-2 bg-passport-primary text-white rounded-md hover:bg-passport-primary-dark transition-colors shadow-passport">
          <svg class="w-4 h-4 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
          </svg>
          Re-authenticate with GitHub
        </a>
        <script>
          // Auto-redirect after 3 seconds
          setTimeout(() => {
            window.location.href = '${authUrl}';
          }, 3000);
        </script>
      </div>
    </body>
    </html>
  `;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html", ...headers },
  });
}

/**
 * Handle CORS preflight requests
 * OPTIONS /api/auth/github/callback
 */
export const onRequestOptions: PagesFunction<AuthEnv> = async ({ request }) => {
  const headers = cors(request);
  return new Response(null, { headers });
};

/**
 * GitHub OAuth callback
 * GET /auth/github/callback
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
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    // Handle OAuth errors
    if (error) {
      const response = new Response(
        JSON.stringify({
          error: "oauth_error",
          message: `GitHub OAuth error: ${error}`,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Validate callback parameters
    const validation = validateGitHubCallback(
      code || "",
      state || "",
      state || ""
    );
    if (!validation.valid) {
      const response = new Response(
        JSON.stringify({
          error: "invalid_callback",
          message: validation.error,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Get stored state data
    const stateData = (await env.ai_passport_registry.get(
      `oauth_state:${state}`,
      "json"
    )) as GitHubAuthState | null;

    if (!stateData) {
      console.error(`OAuth state not found for state: ${state}`);

      // Log available states for debugging (only in development)
      if (env.APP_BASE_URL?.includes("localhost")) {
        const { keys } = await env.ai_passport_registry.list({
          prefix: "oauth_state:",
        });
        console.log(
          `Available OAuth states: ${keys.length}`,
          keys.map((k) => k.name)
        );
      }

      const response = new Response(
        JSON.stringify({
          error: "invalid_state",
          message:
            "OAuth state not found or expired. Please try logging in again.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Clean up state
    await env.ai_passport_registry.delete(`oauth_state:${state}`);

    // Exchange code for access token
    const config = getGitHubConfig(env);
    const accessToken = await exchangeCodeForToken(code!, config);
    if (!accessToken) {
      const response = new Response(
        JSON.stringify({
          error: "token_exchange_failed",
          message: "Failed to exchange code for access token",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Validate token before proceeding
    const isTokenValid = await isGitHubTokenValid(accessToken);
    if (!isTokenValid) {
      console.log(
        "GitHub token is invalid or expired, redirecting to re-authentication"
      );
      return await handleTokenExpiration(env, stateData, headers);
    }

    // Determine which flow to use based on state purpose
    const isOrgVerification = stateData.purpose === "org_verification";

    let result;
    try {
      if (isOrgVerification) {
        result = await handleGitHubOrgVerification(
          env,
          accessToken,
          stateData,
          request
        );
      } else {
        result = await handleRegularGitHubAuth(
          env,
          accessToken,
          stateData,
          request
        );
      }
    } catch (error) {
      console.error("GitHub auth handler error:", error);
      const response = new Response(
        JSON.stringify({
          error: "auth_handler_failed",
          message: "Failed to process GitHub authentication",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Log successful authentication
    const auditType = isOrgVerification
      ? "github_org_verification"
      : "login_github";
    const auditData: any = {
      type: auditType,
      user_id: result.user.user_id,
      github_id: result.githubUser.id.toString(),
      github_login: result.githubUser.login,
      assurance_level: result.user.assurance_level,
      turnstile_verified: stateData.turnstile_verified,
      timestamp: new Date().toISOString(),
    };

    if (isOrgVerification && result.verifiedOrgs) {
      auditData.orgs_verified = result.verifiedOrgs.map((o) => o.org_login);
      auditData.org_memberships_saved = result.verifiedOrgs.length;
    }

    await logger.logAudit(auditData);

    // Generate appropriate success page
    const html = isOrgVerification
      ? generateOrgVerificationSuccessPage(result, env, stateData.return_url)
      : generateRegularAuthSuccessPage(result, env, stateData.return_url);

    const response = new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "Set-Cookie": `${result.cookies.accessToken}; ${result.cookies.refreshToken}`,
        ...headers,
      },
    });

    await logger.logRequest(request, response, startTime, {
      agentId: result.user.user_id,
    });
    return response;
  } catch (error) {
    console.error("GitHub OAuth callback error:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to process GitHub OAuth callback",
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
