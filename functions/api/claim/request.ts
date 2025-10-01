import { cors } from "../../utils/cors";
import { createLogger } from "../../utils/logger";
import {
  sendMagicLinkEmail,
  getEmailConfig,
  createEmailService,
} from "../../utils/email";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";
import { PassportData } from "../../../types/passport";

interface Env {
  ai_passport_registry: KVNamespace;
  AP_VERSION: string;
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
  CLAIM_TOKEN_SECRET: string;
  EMAIL_PROVIDER?: string;
  EMAIL_API_KEY?: string;
  EMAIL_FROM?: string;
  AWS_REGION?: string;
}

interface ClaimRequest {
  agent_id: string;
  email: string;
}

/**
 * /api/claim/request:
 *   post:
 *     summary: Request agent passport claim via email
 *     description: Send a magic link email to claim an agent passport
 *     operationId: requestClaim
 *     tags:
 *       - Claims
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               agent_id:
 *                 type: string
 *                 description: The agent passport ID to claim
 *                 example: "ap_128094d3"
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address to send the claim link to
 *                 example: "owner@example.com"
 *             required:
 *               - agent_id
 *               - email
 *     responses:
 *       200:
 *         description: Claim request sent successfully
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
 *                   example: "Claim email sent if agent exists and email matches"
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "missing_fields"
 *       404:
 *         description: Agent passport not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "not_found"
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

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const startTime = Date.now();
  const headers = cors(request);
  const logger = createLogger(env.ai_passport_registry);

  try {
    const body = (await request.json()) as ClaimRequest;

    // Validate required fields
    if (!body.agent_id || !body.email) {
      const response = new Response(
        JSON.stringify({ error: "missing_fields" }),
        {
          status: 400,
          headers: { "content-type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime, {
        agentId: body.agent_id,
      });
      return response;
    }

    // Get the agent passport
    const key = `passport:${body.agent_id}`;
    const rawPassport = (await env.ai_passport_registry.get(
      key,
      "json"
    )) as PassportData | null;

    if (!rawPassport) {
      const response = new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { "content-type": "application/json", ...headers },
      });

      await logger.logRequest(request, response, startTime, {
        agentId: body.agent_id,
      });
      return response;
    }

    // Check if email matches the contact email
    if (rawPassport.contact !== body.email) {
      // For security, we don't reveal whether the agent exists or not
      // We'll always return success but only send email if it matches
      const response = new Response(
        JSON.stringify({
          ok: true,
          message: "Claim email sent if agent exists and email matches",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime, {
        agentId: body.agent_id,
      });
      return response;
    }

    await sendClaimEmail(body, env, logger);

    const response = new Response(
      JSON.stringify({
        ok: true,
        message: "Claim email sent if agent exists and email matches",
      }),
      {
        status: 200,
        headers: { "content-type": "application/json", ...headers },
      }
    );

    await logger.logRequest(request, response, startTime, {
      agentId: body.agent_id,
    });
    return response;
  } catch (error) {
    console.error("Error processing claim request:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to process claim request",
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
 * Generate a secure claim token
 */
export async function generateClaimToken(
  agentId: string,
  email: string,
  secret: string
): Promise<string> {
  const data = `${agentId}:${email}:${Date.now()}`;
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

  const signature = await crypto.subtle.sign("HMAC", key, messageData);
  const signatureArray = Array.from(new Uint8Array(signature));
  const signatureBase64 = btoa(String.fromCharCode(...signatureArray));

  return `${btoa(data)}.${signatureBase64}`;
}

export const sendClaimEmail = async (
  body: ClaimRequest,
  env: any,
  logger: any
) => {
  // Generate claim token
  const claimToken = await generateClaimToken(
    body.agent_id,
    body.email,
    env.CLAIM_TOKEN_SECRET
  );

  // Store claim token with 24h TTL
  await env.ai_passport_registry.put(
    `claim_token:${claimToken}`,
    JSON.stringify({
      agent_id: body.agent_id,
      email: body.email,
      created_at: new Date().toISOString(),
    }),
    {
      expirationTtl: 86400, // 24 hours
    }
  );

  // Send claim email using the reusable email service
  try {
    const emailConfig = getEmailConfig(env as any);
    const emailService = createEmailService(emailConfig);

    const success = await emailService.sendMagicLink({
      email: body.email,
      token: claimToken,
      agentId: body.agent_id,
    });

    if (!success) {
      console.error("Failed to send claim email");
    }
  } catch (error) {
    console.error("Error sending claim email:", error);
  }

  // Log the claim request
  await logger.logAudit({
    type: "claim_email_requested",
    agent_id: body.agent_id,
    email: body.email,
    timestamp: new Date().toISOString(),
  });
};
