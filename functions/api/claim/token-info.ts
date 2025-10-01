import { cors } from "../../utils/cors";
import { createLogger } from "../../utils/logger";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";

interface Env {
  ai_passport_registry: KVNamespace;
  AP_VERSION: string;
}

/**
 * /api/claim/token-info:
 *   get:
 *     summary: Get claim token information
 *     description: Retrieve information about a claim token
 *     operationId: getClaimTokenInfo
 *     tags:
 *       - Claims
 *     parameters:
 *       - name: token
 *         in: query
 *         required: true
 *         description: The claim token
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Token information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 agent_id:
 *                   type: string
 *                 email:
 *                   type: string
 *                 provisioned_by_org_id:
 *                   type: string
 *                 created_at:
 *                   type: string
 *       400:
 *         description: Missing token parameter
 *       404:
 *         description: Token not found or expired
 *       500:
 *         description: Internal server error
 */
export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const startTime = Date.now();
  const headers = cors(request);
  const logger = createLogger(env.ai_passport_registry);

  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!token) {
      const response = new Response(
        JSON.stringify({ error: "missing_token" }),
        {
          status: 400,
          headers: { "content-type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Get the claim token data
    const claimKey = `claim_token:${token}`;
    const claimData = await env.ai_passport_registry.get(claimKey, "json");

    if (!claimData) {
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

    const response = new Response(JSON.stringify(claimData), {
      status: 200,
      headers: { "content-type": "application/json", ...headers },
    });

    await logger.logRequest(request, response, startTime);
    return response;
  } catch (error) {
    console.error("Error fetching claim token info:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to fetch claim token info",
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
