import { cors } from "../../utils/cors";
import { createLogger } from "../../utils/logger";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";
import { PassportData } from "../../../types/passport";

interface Env {
  ai_passport_registry: KVNamespace;
  AP_VERSION: string;
}

/**
 * @swagger
 * /api/about/{agent_id}:
 *   get:
 *     summary: Get agent passport Agent Passport page
 *     description: Retrieve public information about an agent passport for display on Agent Passport pages
 *     operationId: getAboutPage
 *     tags:
 *       - Public
 *     parameters:
 *       - name: agent_id
 *         in: path
 *         required: true
 *         description: The agent passport ID
 *         schema:
 *           type: string
 *           example: "aeebc92d-13fb-4e23-8c3c-1aa82b167da6"
 *     responses:
 *       200:
 *         description: Agent passport Agent Passport page data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 agent_id:
 *                   type: string
 *                   example: "aeebc92d-13fb-4e23-8c3c-1aa82b167da6"
 *                 name:
 *                   type: string
 *                   example: "Customer Support Bot"
 *                 owner:
 *                   type: string
 *                   example: "Acme Corp"
 *                 description:
 *                   type: string
 *                   example: "AI-powered customer support agent"
 *                 status:
 *                   type: string
 *                   enum: [active, suspended, revoked]
 *                   example: "active"
 *                 verification_status:
 *                   type: string
 *                   enum: [unverified, email_verified, github_verified]
 *                   example: "email_verified"
 *                 verification_method:
 *                   type: string
 *                   example: "email"
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-01-15T10:30:00Z"
 *                 updated_at:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-01-15T10:30:00Z"
 *                 badge_url:
 *                   type: string
 *                   example: "https://aport.io/badge/aeebc92d-13fb-4e23-8c3c-1aa82b167da6.svg"
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
 */
export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestGet: PagesFunction<Env> = async ({
  request,
  env,
  params,
}) => {
  const startTime = Date.now();
  const headers = cors(request);
  const logger = createLogger(env.ai_passport_registry);

  try {
    const agentId = params.agent_id as string;

    if (!agentId) {
      const response = new Response(
        JSON.stringify({ error: "missing_agent_id" }),
        {
          status: 400,
          headers: { "content-type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Get the agent passport
    const key = `passport:${agentId}`;
    const rawPassport = (await env.ai_passport_registry.get(
      key,
      "json"
    )) as PassportData | null;

    if (!rawPassport) {
      const response = new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { "content-type": "application/json", ...headers },
      });

      await logger.logRequest(request, response, startTime, { agentId });
      return response;
    }

    // Return public information for Agent Passport page
    const aboutData = {
      ...rawPassport,
      badge_url: `https://aport.io/badge/${agentId}.svg`,
    };

    const response = new Response(JSON.stringify(aboutData), {
      status: 200,
      headers: { "content-type": "application/json", ...headers },
    });

    await logger.logRequest(request, response, startTime, { agentId });
    return response;
  } catch (error) {
    console.error("Error getting Agent Passport page:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to get Agent Passport page",
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
