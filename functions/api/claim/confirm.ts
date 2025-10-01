import { cors } from "../../utils/cors";
import { getAppBaseUrl } from "../../utils/email";
import { createLogger } from "../../utils/logger";
import { authMiddleware } from "../../utils/auth-middleware";
import {
  createAuditAction,
  completeAuditAction,
  storeAuditAction,
  computePassportDiffs,
  getLastActionHash,
} from "../../utils/audit-trail";
import {
  KVNamespace,
  R2Bucket,
  PagesFunction,
} from "@cloudflare/workers-types";
import { PassportData } from "../../../types/passport";

interface Env {
  ai_passport_registry: KVNamespace;
  AP_VERSION: string;
  CLAIM_TOKEN_SECRET: string;
  PASSPORT_SNAPSHOTS_BUCKET?: R2Bucket;
  JWT_SECRET: string;
  REGISTRY_PRIVATE_KEY?: string;
}

/**
 * /api/claim/confirm:
 *   get:
 *     summary: Confirm agent passport claim via token
 *     description: Verify and complete the agent passport claim process using a magic link token
 *     operationId: confirmClaim
 *     tags:
 *       - Claims
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: token
 *         in: query
 *         required: true
 *         description: The claim token received via email
 *         schema:
 *           type: string
 *           example: "eyJhZ2VudF9pZCI6ImFwXzEyMyIsImVtYWlsIjoib3duZXJAZXhhbXBsZS5jb20ifQ==.abc123..."
 *     responses:
 *       200:
 *         description: Claim confirmed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Agent passport claimed successfully"
 *                 agent_id:
 *                   type: string
 *                   example: "ap_128094d3"
 *       400:
 *         description: Invalid or missing token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "invalid_token"
 *       404:
 *         description: Token not found or expired
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "token_not_found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "internal_server_error"
 */
export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const startTime = Date.now();
  const headers = cors(request);
  const logger = createLogger(env.ai_passport_registry);

  let authenticatedUser = null;
  try {
    const authResult = await authMiddleware(request, env as any);
    if (authResult.success && authResult.user) {
      authenticatedUser = authResult.user;
    }
  } catch (error) {
    // Authentication failed, continue with token-based flow
    console.log("Authentication failed, falling back to token-based flow");
  }

  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!token) {
      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invalid Token - Agent Passport</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 min-h-screen flex items-center justify-center">
    <div class="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div class="mb-6">
            <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </div>
            <h1 class="text-2xl font-bold text-gray-900 mb-2">Invalid Token</h1>
            <p class="text-gray-600">The claim token is missing or invalid.</p>
        </div>
        <a href="${getAppBaseUrl(
          env as any
        )}" class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
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

    // Verify and decode the token
    const tokenData = await verifyClaimToken(token, env.CLAIM_TOKEN_SECRET);
    if (!tokenData) {
      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invalid Token - Agent Passport</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 min-h-screen flex items-center justify-center">
    <div class="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div class="mb-6">
            <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </div>
            <h1 class="text-2xl font-bold text-gray-900 mb-2">Invalid Token</h1>
            <p class="text-gray-600">The claim token is invalid or expired.</p>
        </div>
        <a href="${getAppBaseUrl(
          env as any
        )}" class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
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

    // Get the stored claim token data
    const claimTokenKey = `claim_token:${token}`;
    const storedTokenData = await env.ai_passport_registry.get(
      claimTokenKey,
      "json"
    );

    if (!storedTokenData) {
      const response = new Response(
        JSON.stringify({ error: "token_not_found" }),
        {
          status: 404,
          headers: { "content-type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Get the agent passport
    const passportKey = `passport:${tokenData.agent_id}`;
    const rawPassport = (await env.ai_passport_registry.get(
      passportKey,
      "json"
    )) as PassportData | null;

    if (!rawPassport) {
      const response = new Response(
        JSON.stringify({ error: "agent_not_found" }),
        {
          status: 404,
          headers: { "content-type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime, {
        agentId: tokenData.agent_id,
      });
      return response;
    }

    // Update the passport with claim information
    const now = new Date().toISOString();

    // Determine owner_id based on claim context
    let ownerId = rawPassport.owner_id;
    if (authenticatedUser) {
      // Authenticated user claim - use the authenticated user's ID
      ownerId =
        authenticatedUser.user?.user_id || authenticatedUser.user?.email || "";
    } else if (rawPassport.pending_owner?.email === tokenData.email) {
      // This is a delegated issuance being claimed
      // For now, we'll use the user's email as owner_id
      // In a full implementation, you'd look up the user_id from email
      ownerId = `ap_user_${tokenData.email.replace(/[^a-zA-Z0-9]/g, "_")}`;
    }

    // For instances, owner_id should be controller_id (the tenant who controls it)
    // For templates, owner_id should be the claiming user
    const finalOwnerId =
      rawPassport.kind === "instance" && rawPassport.controller_id
        ? rawPassport.controller_id
        : ownerId;

    const updatedPassport: PassportData = {
      ...rawPassport,
      owner_id: finalOwnerId,
      claimed: true,
      verification_status: "email_verified",
      verification_method: "email",
      verification_evidence: {
        ...rawPassport.verification_evidence,
        email: authenticatedUser?.user?.email || tokenData.email,
        verified_at: now,
      },
      assurance_level: "L1",
      assurance_method: "email_verified",
      assurance_verified_at: now,
      updated_at: now,
      // Clear pending owner after successful claim
      pending_owner: undefined,
      // Keep sponsor_orgs for sponsor visibility
      sponsor_orgs: rawPassport.sponsor_orgs || [],
    };

    // Store the updated passport and update caches
    const updatePromises = [
      env.ai_passport_registry.put(
        passportKey,
        JSON.stringify(updatedPassport)
      ),
      // Invalidate pre-serialized cache
      env.ai_passport_registry.delete(
        `passport_serialized:${tokenData.agent_id}`
      ),
      // Delete the used claim token
      env.ai_passport_registry.delete(claimTokenKey),
    ];

    // Update R2 snapshot if available
    if (env.PASSPORT_SNAPSHOTS_BUCKET) {
      const { buildPassportObject } = await import("../../utils/serialization");
      const passport = buildPassportObject(updatedPassport, env.AP_VERSION);
      const r2Key = `passports/${tokenData.agent_id}.json`;
      updatePromises.push(
        env.PASSPORT_SNAPSHOTS_BUCKET.put(r2Key, JSON.stringify(passport)).then(
          () => {}
        )
      );
    }

    // Create audit action for claim confirmation
    const changes = computePassportDiffs(rawPassport, updatedPassport);
    const auditAction = await createAuditAction(
      "claim_email_verified",
      tokenData.agent_id,
      ownerId,
      changes,
      "Passport claimed via email verification"
    );

    const prevHash = await getLastActionHash(
      env.ai_passport_registry,
      tokenData.agent_id
    );
    const completedAuditAction = await completeAuditAction(
      auditAction,
      prevHash,
      env.REGISTRY_PRIVATE_KEY || undefined
    );

    // Store audit action
    updatePromises.push(
      storeAuditAction(env.ai_passport_registry, completedAuditAction)
    );

    await Promise.all(updatePromises);

    // Log the successful claim
    await logger.logAudit({
      type: "passport_claimed",
      agent_id: tokenData.agent_id,
      email: authenticatedUser?.user?.email || tokenData.email,
      owner_id: ownerId,
      assurance_level: "L1",
      assurance_method: "email_verified",
      sponsor_orgs: rawPassport.sponsor_orgs || [],
      timestamp: now,
    });

    // Return HTML page instead of JSON
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claim Confirmed - Agent Passport</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 min-h-screen flex items-center justify-center">
    <div class="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div class="mb-6">
            <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
            </div>
            <h1 class="text-2xl font-bold text-gray-900 mb-2">Claim Confirmed!</h1>
            <p class="text-gray-600">Your agent passport has been successfully claimed.</p>
        </div>
        
        <div class="bg-gray-50 rounded-lg p-4 mb-6">
            <div class="text-sm text-gray-500 mb-1">Agent ID</div>
            <div class="font-mono text-lg font-semibold text-gray-900">${
              tokenData.agent_id
            }</div>
        </div>
        
        <div class="space-y-3">
            <div class="flex items-center justify-center space-x-2 text-sm text-gray-600">
                <svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span>Email verified: ${
                  authenticatedUser?.user?.email || tokenData.email
                }</span>
            </div>
            <div class="flex items-center justify-center space-x-2 text-sm text-gray-600">
                <svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span>Assurance Level: L1 (Email Verified)</span>
            </div>
            <div class="flex items-center justify-center space-x-2 text-sm text-gray-600">
                <svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span>Status: Active</span>
            </div>
        </div>
        
        <div class="mt-8">
            <a href="${getAppBaseUrl(
              env as any
            )}" class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                </svg>
                View Registry
            </a>
        </div>
        
        <div class="mt-6 text-xs text-gray-500">
            This page will automatically close in <span id="countdown">10</span> seconds
        </div>
    </div>
    
    <script>
        let countdown = 10;
        const countdownElement = document.getElementById('countdown');
        
        const timer = setInterval(() => {
            countdown--;
            countdownElement.textContent = countdown;
            
            if (countdown <= 0) {
                clearInterval(timer);
                window.close();
            }
        }, 1000);
    </script>
</body>
</html>`;

    const response = new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        ...headers,
      },
    });

    await logger.logRequest(request, response, startTime, {
      agentId: tokenData.agent_id,
    });
    return response;
  } catch (error) {
    console.error("Error processing claim confirmation:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to process claim confirmation",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json", ...headers },
      }
    );

    await logger.logRequest(request, response, startTime);
    return response;
  }
};

/**
 * Verify and decode a claim token
 */
async function verifyClaimToken(
  token: string,
  secret: string
): Promise<{ agent_id: string; email: string } | null> {
  try {
    const [dataBase64, signatureBase64] = token.split(".");
    if (!dataBase64 || !signatureBase64) {
      return null;
    }

    const data = atob(dataBase64);
    const [agentId, email, timestamp] = data.split(":");

    if (!agentId || !email || !timestamp) {
      return null;
    }

    // Check if token is not too old (24 hours)
    const tokenTime = parseInt(timestamp);
    const now = Date.now();
    if (now - tokenTime > 24 * 60 * 60 * 1000) {
      return null;
    }

    // Verify signature
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(data);

    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const expectedSignature = await crypto.subtle.sign(
      "HMAC",
      key,
      messageData
    );
    const expectedSignatureArray = Array.from(
      new Uint8Array(expectedSignature)
    );
    const expectedSignatureBase64 = btoa(
      String.fromCharCode(...expectedSignatureArray)
    );

    if (signatureBase64 !== expectedSignatureBase64) {
      return null;
    }

    return { agent_id: agentId, email };
  } catch (error) {
    console.error("Error verifying claim token:", error);
    return null;
  }
}
