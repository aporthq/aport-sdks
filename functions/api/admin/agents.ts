import { cors } from "../../utils/cors";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";

/**
 * components:
 *   schemas:
 *     AgentListItem:
 *       type: object
 *       required:
 *         - agent_id
 *         - status
 *         - owner
 *         - role
 *         - updated_at
 *       properties:
 *         agent_id:
 *           type: string
 *           description: Unique identifier for the AI agent
 *           example: "aeebc92d-13fb-4e23-8c3c-1aa82b167da6"
 *         status:
 *           type: string
 *           enum: [active, suspended, revoked]
 *           description: Current status of the agent
 *           example: "active"
 *         owner:
 *           type: string
 *           description: Organization or individual who owns the agent
 *           example: "Acme Corp"
 *         role:
 *           type: string
 *           description: Functional role or tier of the agent
 *           example: "Tier-1"
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: ISO 8601 timestamp of last update
 *           example: "2024-01-15T10:30:00Z"
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: ISO 8601 timestamp of creation
 *           example: "2024-01-15T10:30:00Z"
 *     AgentListResponse:
 *       type: object
 *       required:
 *         - agents
 *       properties:
 *         agents:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/AgentListItem'
 *           description: List of all registered agents
 *           example:
 *             - agent_id: "aeebc92d-13fb-4e23-8c3c-1aa82b167da6"
 *               status: "active"
 *               owner: "Acme Corp"
 *               role: "Tier-1"
 *               updated_at: "2024-01-15T10:30:00Z"
 *             - agent_id: "ap_456"
 *               status: "suspended"
 *               owner: "Beta Inc"
 *               role: "Tier-2"
 *               updated_at: "2024-01-14T15:20:00Z"
 */

interface Env {
  ai_passport_registry: KVNamespace;
  ADMIN_TOKEN: string;
}

interface AgentListItem {
  agent_id: string;
  status: string;
  owner: string;
  role: string;
  updated_at: string;
  created_at: string;
}

/**
 * /api/admin/agents:
 *   get:
 *     summary: List all agent passports
 *     description: Retrieve a list of all registered agent passports sorted by creation date (most recent first) (admin only)
 *     operationId: listAgents
 *     tags:
 *       - Admin
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of agents retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AgentListResponse'
 *             example:
 *               agents:
 *                 - agent_id: "aeebc92d-13fb-4e23-8c3c-1aa82b167da6"
 *                   status: "active"
 *                   owner: "Acme Corp"
 *                   role: "Tier-1"
 *                   updated_at: "2024-01-15T10:30:00Z"
 *                 - agent_id: "ap_456"
 *                   status: "suspended"
 *                   owner: "Beta Inc"
 *                   role: "Tier-2"
 *                   updated_at: "2024-01-14T15:20:00Z"
 *       401:
 *         description: Unauthorized - invalid admin token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "unauthorized"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "internal_server_error"
 *               message: "Failed to list agents"
 */
export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const headers = cors(request);
  const auth = request.headers.get("authorization");

  if (auth !== `Bearer ${env.ADMIN_TOKEN}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json", ...headers },
    });
  }

  try {
    // List all keys with passport: prefix
    const { keys } = await env.ai_passport_registry.list({
      prefix: "passport:",
    });

    // Extract agent_ids from keys
    const agentIds = keys.map((key) => key.name.replace("passport:", ""));

    // If no agents found, return empty array
    if (agentIds.length === 0) {
      return new Response(JSON.stringify({ agents: [] }), {
        status: 200,
        headers: { "content-type": "application/json", ...headers },
      });
    }

    // Get basic info for each agent (for efficiency, we'll get minimal data)
    const agentPromises = agentIds.map(async (agentId) => {
      const key = `passport:${agentId}`;
      const passportData = (await env.ai_passport_registry.get(
        key,
        "json"
      )) as any;

      if (passportData) {
        // Return all passport data for admin view
        return passportData;
      }
      return null;
    });

    const agents = (await Promise.all(agentPromises)).filter(
      Boolean
    ) as AgentListItem[];

    // Sort agents by creation date (most recent first)
    agents.sort((a, b) => {
      const dateA = new Date(a.created_at || a.updated_at).getTime();
      const dateB = new Date(b.created_at || b.updated_at).getTime();
      return dateB - dateA; // Most recent first
    });

    return new Response(JSON.stringify({ agents }), {
      status: 200,
      headers: { "content-type": "application/json", ...headers },
    });
  } catch (error) {
    console.error("Error listing agents:", error);
    return new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to list agents",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json", ...headers },
      }
    );
  }
};
