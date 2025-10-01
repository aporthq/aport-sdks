/**
 * Email Magic Link Callback Endpoint
 *
 * Handles the callback from email magic links and creates user session.
 */

import { PagesFunction } from "@cloudflare/workers-types";
import { cors } from "../../../utils/cors";
import { createLogger } from "../../../utils/logger";
import { AuthEnv } from "../../../../types/auth";
import { EmailCallbackData } from "../../../../types/auth";
import { verifyMagicLinkToken, getAppBaseUrl } from "../../../utils/email";
import {
  createOrUpdateUser,
  createSession,
  createJWT,
  createAuthCookies,
  getClientIP,
  getUserAgent,
  generateSecureToken,
} from "../../../utils/auth";
import {
  AttestationService,
  getAttestationConfig,
  createEvidenceForType,
} from "../../../utils/attestation-service";
import { authMiddleware } from "../../../utils/auth-middleware";

/**
 * Handle CORS preflight requests
 * OPTIONS /auth/email/callback
 */
export const onRequestOptions: PagesFunction<AuthEnv> = async ({ request }) => {
  const headers = cors(request);
  return new Response(null, { headers });
};

/**
 * Email magic link callback
 * GET /auth/email/callback
 */
export const onRequestGet: PagesFunction<AuthEnv> = async ({
  request,
  env,
}) => {
  const startTime = Date.now();
  const headers = cors(request);
  const logger = createLogger(env.ai_passport_registry);

  // Try to authenticate the user first (if they're already logged in)
  let authenticatedUser = null;
  try {
    const authResult = await authMiddleware(request, env);
    if (authResult.success && authResult.user) {
      authenticatedUser = authResult.user;
      console.log(
        `[Email Callback] User already authenticated: ${authenticatedUser.user?.user_id}`
      );
    }
  } catch (error) {
    // Authentication failed, continue with email verification flow
    console.log(
      "[Email Callback] No existing authentication, proceeding with email verification"
    );
  }

  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!token) {
      const html = `
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invalid Link - Agent Passport</title>
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
            <div class="w-16 h-16 bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                <svg class="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </div>
            <h1 class="text-2xl font-bold text-passport-text mb-2">Invalid Link</h1>
            <p class="text-passport-text-muted">The magic link is missing or invalid.</p>
        </div>
        <a href="${getAppBaseUrl(
          env
        )}" class="inline-flex items-center px-4 py-2 bg-passport-primary text-white rounded-md hover:bg-passport-primary-dark transition-colors shadow-passport">
            Return to Registry
        </a>
    </div>
</body>
</html>`;

      const response = new Response(html, {
        status: 400,
        headers: { "content-type": "text/html; charset=utf-8", ...headers },
      });

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Verify magic link token
    const tokenVerification = verifyMagicLinkToken(token);
    if (!tokenVerification.valid) {
      const html = `
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invalid Link - Agent Passport</title>
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
            <div class="w-16 h-16 bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                <svg class="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </div>
            <h1 class="text-2xl font-bold text-passport-text mb-2">Invalid Link</h1>
            <p class="text-passport-text-muted">The magic link is invalid or expired.</p>
        </div>
        <a href="${getAppBaseUrl(
          env
        )}" class="inline-flex items-center px-4 py-2 bg-passport-primary text-white rounded-md hover:bg-passport-primary-dark transition-colors shadow-passport">
            Return to Registry
        </a>
    </div>
</body>
</html>`;

      const response = new Response(html, {
        status: 400,
        headers: { "content-type": "text/html; charset=utf-8", ...headers },
      });

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Get stored token data
    const tokenData = (await env.ai_passport_registry.get(
      `magic_link:${token}`,
      "json"
    )) as {
      email: string;
      turnstile_verified: boolean;
      return_url?: string;
      created_at: string;
      ip_address: string;
      user_agent: string;
    } | null;

    if (!tokenData) {
      const html = `
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Link Expired - Agent Passport</title>
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
                <svg class="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
                </svg>
            </div>
            <h1 class="text-2xl font-bold text-passport-text mb-2">Link Expired</h1>
            <p class="text-passport-text-muted">This magic link has expired. Please request a new one.</p>
        </div>
        <a href="${getAppBaseUrl(
          env
        )}" class="inline-flex items-center px-4 py-2 bg-passport-primary text-white rounded-md hover:bg-passport-primary-dark transition-colors shadow-passport">
            Return to Registry
        </a>
    </div>
</body>
</html>`;

      const response = new Response(html, {
        status: 400,
        headers: { "content-type": "text/html; charset=utf-8", ...headers },
      });

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Clean up token
    await env.ai_passport_registry.delete(`magic_link:${token}`);

    // Determine user ID and user data
    let userId: string;
    let user: any;

    if (authenticatedUser && authenticatedUser.user) {
      // User is already authenticated - update their existing account
      userId = authenticatedUser.user.user_id;
      console.log(
        `[Email Callback] Updating existing user: ${userId} with email: ${tokenData.email}`
      );

      // Get existing user data
      const existingUser = await createOrUpdateUser(env.ai_passport_registry, {
        user_id: userId,
        email: tokenData.email, // Add the new verified email
        display_name:
          authenticatedUser.user.display_name || tokenData.email.split("@")[0],
        last_login_at: new Date().toISOString(),
      });

      user = existingUser;
    } else {
      // No existing authentication - check if user with this email already exists
      const emailHash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(tokenData.email)
      );
      const emailHashHex = Array.from(new Uint8Array(emailHash))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .substring(0, 16);
      const deterministicUserId = `ap_user_${emailHashHex}`;

      // Check if deterministic user already exists
      const existingUser = await env.ai_passport_registry.get(
        `user:${deterministicUserId}`,
        "json"
      );

      if (existingUser) {
        // User with this email already exists - update them
        userId = deterministicUserId;
        console.log(
          `[Email Callback] Updating existing user by email: ${userId}`
        );

        user = await createOrUpdateUser(env.ai_passport_registry, {
          user_id: userId,
          email: tokenData.email,
          display_name:
            (existingUser as any).display_name || tokenData.email.split("@")[0],
          last_login_at: new Date().toISOString(),
        });
      } else {
        // No existing user - create new one
        userId = deterministicUserId;
        console.log(`[Email Callback] Creating new user: ${userId}`);

        user = await createOrUpdateUser(env.ai_passport_registry, {
          user_id: userId,
          email: tokenData.email,
          display_name: tokenData.email.split("@")[0],
          last_login_at: new Date().toISOString(),
        });
      }
    }

    // Update assurance level using attestation service
    try {
      const attestationConfig = getAttestationConfig(env);
      const evidence = createEvidenceForType(
        "email_verification",
        tokenData.email,
        {
          email: tokenData.email,
          turnstile_verified: tokenData.turnstile_verified,
        }
      );

      const attestationService = new AttestationService(
        env.ai_passport_registry,
        attestationConfig,
        env.AP_VERSION
      );

      // Create and verify attestation
      const attestation = await attestationService.createAttestation({
        type: "email_verification",
        subject_id: userId,
        subject_type: "user",
        evidence,
        verified_by: "email_magic_link",
        comment: `Email verification for ${tokenData.email}`,
        expires_at: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString(), // 30 days
      });

      const verificationResult = await attestationService.verifyEvidence({
        attestation_id: attestation.attestation_id,
        evidence: {
          ...evidence,
          verified_at: new Date().toISOString(),
        },
        verified_by: "email_magic_link",
        comment: `Email verification for ${tokenData.email}`,
      });

      if (verificationResult.valid) {
        console.log(
          `[Email Callback] Updated user ${userId} assurance level to ${verificationResult.attestation?.assurance_level}`
        );
      } else {
        console.warn(
          `[Email Callback] Failed to verify attestation: ${verificationResult.error}`
        );
      }
    } catch (error) {
      console.error("Error updating assurance level:", error);
      // Fallback to basic assurance level
      await createOrUpdateUser(env.ai_passport_registry, {
        user_id: userId,
        assurance_level: "L1",
        assurance_method: "email_verified",
        assurance_verified_at: new Date().toISOString(),
      });
    }

    // Create session (only if not already authenticated)
    let sessionId: string;
    let refreshTokenId: string;

    if (authenticatedUser && authenticatedUser.session) {
      // User already has a session - reuse it
      sessionId = authenticatedUser.session.user_id;
      refreshTokenId = authenticatedUser.session.user_id; // Simplified for existing session
      console.log(`[Email Callback] Reusing existing session: ${sessionId}`);
    } else {
      // Create new session
      const sessionResult = await createSession(
        env.ai_passport_registry,
        user,
        "email",
        getClientIP(request),
        getUserAgent(request),
        tokenData.turnstile_verified
      );
      sessionId = sessionResult.sessionId;
      refreshTokenId = sessionResult.refreshTokenId;
      console.log(`[Email Callback] Created new session: ${sessionId}`);
    }

    // Create JWT
    const jwt = await createJWT(
      {
        sub: user.user_id,
        session_id: sessionId,
        provider: "email",
        assurance_level: user.assurance_level,
        turnstile_verified: tokenData.turnstile_verified,
      },
      env.JWT_SECRET,
      900 // 15 minutes
    );

    // Create cookies (detect local development)
    const isLocalDev =
      env.APP_BASE_URL && env.APP_BASE_URL.includes("localhost");
    const cookies = createAuthCookies(
      jwt,
      refreshTokenId,
      isLocalDev ? "127.0.0.1" : undefined, // Use 127.0.0.1 for local dev
      !!isLocalDev
    );

    // Log successful login
    await logger.logAudit({
      type: "login_email",
      user_id: user.user_id,
      email: user.email,
      assurance_level: user.assurance_level,
      turnstile_verified: tokenData.turnstile_verified,
      timestamp: new Date().toISOString(),
    });

    // Determine redirect URL
    const returnUrl = tokenData.return_url
      ? tokenData.return_url.startsWith("http")
        ? tokenData.return_url
        : `${getAppBaseUrl(env)}/${tokenData.return_url.replace(/^\//, "")}`
      : `${getAppBaseUrl(env)}/user-dashboard`;
    const finalUrl = isLocalDev
      ? `${returnUrl}${
          returnUrl.includes("?") ? "&" : "?"
        }auth_token=${jwt}&refresh_token=${refreshTokenId}`
      : returnUrl;

    // Return success page for production
    const html = `
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign In Successful - Agent Passport</title>
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
            <div class="w-16 h-16 bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-500/20">
                <svg class="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
            </div>
            <h1 class="text-2xl font-bold text-passport-text mb-2">Sign In Successful!</h1>
            <p class="text-passport-text-muted">You have been successfully signed in to Agent Passport.</p>
        </div>
        
        <div class="bg-slate-800/50 rounded-lg p-4 mb-6 border border-passport-border">
            <div class="text-sm text-passport-text-muted mb-1">Email</div>
            <div class="font-mono text-lg font-semibold text-passport-text">${user.email}</div>
        </div>
        
        <div class="space-y-3">
            <div class="flex items-center justify-center space-x-2 text-sm text-passport-text-muted">
                <svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span>Email verified: ${user.email}</span>
            </div>
            <div class="flex items-center justify-center space-x-2 text-sm text-passport-text-muted">
                <svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span>Assurance Level: L1 (Email Verified)</span>
            </div>
        </div>
        
        <div class="mt-8">
            <a href="${finalUrl}" class="inline-flex items-center px-4 py-2 bg-passport-primary text-white rounded-md hover:bg-passport-primary-dark transition-colors shadow-passport">
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                </svg>
                Go to Dashboard
            </a>
        </div>
        
        <div class="mt-6 text-xs text-passport-text-muted">
            This page will automatically redirect in <span id="countdown">5</span> seconds
        </div>
    </div>
    
    <script>
        let countdown = 5;
        const countdownElement = document.getElementById('countdown');
        
        const timer = setInterval(() => {
            countdown--;
            countdownElement.textContent = countdown;
            
            if (countdown <= 0) {
                clearInterval(timer);
                window.location.href = '${finalUrl}';
            }
        }, 1000);
    </script>
</body>
</html>`;

    const response = new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "Set-Cookie": `${cookies.accessToken}; ${cookies.refreshToken}`,
        ...headers,
      },
    });

    await logger.logRequest(request, response, startTime, {
      agentId: user.user_id,
    });
    return response;
  } catch (error) {
    console.error("Email magic link callback error:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to process email magic link callback",
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
