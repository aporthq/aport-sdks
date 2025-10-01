/**
 * Email Magic Link Authentication Endpoints
 *
 * Handles email magic link login requests and callbacks.
 */

import { PagesFunction } from "@cloudflare/workers-types";
import { cors } from "../../utils/cors";
import { createLogger } from "../../utils/logger";
import { AuthEnv } from "../../../types/auth";
import { EmailAuthRequest } from "../../../types/auth";
import {
  sendMagicLinkEmail,
  createMagicLinkToken,
  verifyMagicLinkToken,
  checkEmailRateLimit,
  getEmailConfig,
  getAppBaseUrl,
  getBackendBaseUrl,
} from "../../utils/email";
import {
  createOrUpdateUser,
  createSession,
  createJWT,
  createAuthCookies,
  getClientIP,
  getUserAgent,
  generateSecureToken,
} from "../../utils/auth";
import { verifyTurnstileToken } from "../../utils/github";

/**
 * Handle CORS preflight requests
 * OPTIONS /auth/email
 */
export const onRequestOptions: PagesFunction<AuthEnv> = async ({ request }) => {
  const headers = cors(request);
  return new Response(null, { headers });
};

/**
 * Email magic link request
 * POST /auth/email
 */
export const onRequestPost: PagesFunction<AuthEnv> = async ({
  request,
  env,
}) => {
  const startTime = Date.now();
  const headers = cors(request);
  const logger = createLogger(env.ai_passport_registry);

  try {
    const body = (await request.json().catch(() => ({}))) as EmailAuthRequest;
    const { email, turnstile_token, return_url } = body;

    // Validate email
    if (!email || !email.includes("@")) {
      const response = new Response(
        JSON.stringify({
          error: "invalid_email",
          message: "Valid email address is required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Check rate limiting
    const rateLimit = await checkEmailRateLimit(
      env.ai_passport_registry,
      email,
      5, // max 5 attempts
      15 // per 15 minutes
    );

    if (!rateLimit.allowed) {
      const response = new Response(
        JSON.stringify({
          error: "rate_limit_exceeded",
          message: "Too many email requests. Please try again later.",
          reset_at: new Date(rateLimit.resetAt).toISOString(),
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Verify Turnstile token if provided
    if (turnstile_token && env.TURNSTILE_SECRET_KEY) {
      const turnstileResult = await verifyTurnstileToken(
        turnstile_token,
        env.TURNSTILE_SECRET_KEY,
        getClientIP(request)
      );

      if (!turnstileResult.success) {
        const response = new Response(
          JSON.stringify({
            error: "turnstile_verification_failed",
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

    // Create magic link token
    const token = createMagicLinkToken(email, 900); // 15 minutes

    // Log magic link token in development
    const isLocalDev =
      env.APP_BASE_URL && env.APP_BASE_URL.includes("localhost");
    if (isLocalDev) {
      console.log("🔗 Magic Link Token (Development):", token);
      console.log(
        "🔗 Magic Link URL:",
        `${getBackendBaseUrl(env)}/api/auth/email/callback?token=${token}`
      );
    }

    // Store token in KV for verification
    await env.ai_passport_registry.put(
      `magic_link:${token}`,
      JSON.stringify({
        email,
        turnstile_verified: !!turnstile_token,
        return_url: return_url || getAppBaseUrl(env),
        created_at: new Date().toISOString(),
        ip_address: getClientIP(request),
        user_agent: getUserAgent(request),
      }),
      {
        expirationTtl: 900, // 15 minutes
      }
    );

    // Send magic link email
    const emailSent = await sendMagicLinkEmail(
      {
        email,
        token,
        returnUrl: return_url || getAppBaseUrl(env),
      },
      env
    );

    if (!emailSent) {
      const response = new Response(
        JSON.stringify({
          error: "email_send_failed",
          message: "Failed to send magic link email",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Log email request
    await logger.logAudit({
      type: "login_email_requested",
      email,
      turnstile_verified: !!turnstile_token,
      timestamp: new Date().toISOString(),
    });

    const response = new Response(
      JSON.stringify({
        ok: true,
        message: "Magic link sent to your email address",
        expires_in: 900, // 15 minutes
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...headers },
      }
    );

    await logger.logRequest(request, response, startTime);
    return response;
  } catch (error) {
    console.error("Email magic link request error:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to process email magic link request",
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
