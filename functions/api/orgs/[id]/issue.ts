import {
  PagesFunction,
  KVNamespace,
  R2Bucket,
} from "@cloudflare/workers-types";
import { cors } from "../../../utils/cors";
import { createLogger } from "../../../utils/logger";
import { authMiddleware } from "../../../utils/auth-middleware";
import {
  processIssuance,
  IssuanceRequest,
  IssuanceContext,
} from "../../../utils/issuance";
import { getOrganization } from "../../../utils/org-management";
import { sendClaimEmail } from "../../../api/claim/request";

interface Env {
  ai_passport_registry: KVNamespace;
  PASSPORT_SNAPSHOTS_BUCKET?: R2Bucket;
  AP_VERSION: string;
  REGISTRY_PRIVATE_KEY?: string;
  JWT_SECRET: string;
}

/**
 * /api/orgs/{org_id}/issue:
 *   post:
 *     summary: Delegated passport issuance by organization
 *     description: Create a passport for an agent on behalf of an organization
 *     operationId: issuePassportForOrg
 *     tags:
 *       - Issuance
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: org_id
 *         in: path
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *           example: "ap_org_123"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - role
 *               - description
 *               - regions
 *               - contact
 *             properties:
 *               name:
 *                 type: string
 *                 description: Agent name
 *                 example: "Platform AI Assistant"
 *               role:
 *                 type: string
 *                 description: Agent role/purpose
 *                 example: "Customer Support"
 *               description:
 *                 type: string
 *                 description: Detailed agent description
 *                 example: "AI assistant for customer support queries"
 *               capabilities:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     params:
 *                       type: object
 *                 description: Agent capabilities
 *               regions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: ISO-3166 country codes
 *                 example: ["US", "CA"]
 *               contact:
 *                 type: string
 *                 format: email
 *                 description: Contact email
 *                 example: "owner@example.com"
 *               links:
 *                 type: object
 *                 properties:
 *                   homepage:
 *                     type: string
 *                   docs:
 *                     type: string
 *                   repo:
 *                     type: string
 *               categories:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Agent categories
 *               framework:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: AI frameworks used
 *               logo_url:
 *                 type: string
 *                 description: Agent logo URL
 *               status:
 *                 type: string
 *                 enum: [draft, active, suspended, revoked]
 *                 default: active
 *               pending_owner:
 *                 type: object
 *                 properties:
 *                   email:
 *                     type: string
 *                     format: email
 *                   github_username:
 *                     type: string
 *                 description: Intended owner for claim flow
 *     responses:
 *       201:
 *         description: Passport issued successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 agent_id:
 *                   type: string
 *                   example: "ap_128094d345678"
 *                 claimed:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Passport issued and ready for claim"
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "missing_required_fields"
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "unauthorized"
 *       403:
 *         description: Organization cannot issue for others
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "org_cannot_issue"
 *       404:
 *         description: Organization not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "org_not_found"
 *       409:
 *         description: Agent already exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "agent_exists"
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
export const onRequestOptions: PagesFunction<Env> = async ({ request }) => {
  const headers = cors(request);
  return new Response(null, { headers });
};

export const onRequestPost: PagesFunction<Env> = async ({
  request,
  env,
  params,
}) => {
  const startTime = Date.now();
  const headers = cors(request);
  const logger = createLogger(env.ai_passport_registry);

  try {
    // Authenticate user (allow both JWT and API key)
    const authResult = await authMiddleware(request, env as any, {
      requireAuth: true,
      allowApiKey: true,
      requiredApiKeyScopes: ["issue"],
    });
    if (!authResult.success) {
      const response = new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json", ...headers },
      });

      await logger.logRequest(request, response, startTime);
      return response;
    }

    const user = authResult.user;
    const orgId = params?.id as string;

    if (!orgId) {
      const response = new Response(
        JSON.stringify({ error: "org_id_required" }),
        {
          status: 400,
          headers: { "content-type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Get organization and verify user is admin
    const org = await getOrganization(env.ai_passport_registry, orgId);
    if (!org) {
      const response = new Response(
        JSON.stringify({ error: "org_not_found" }),
        {
          status: 404,
          headers: { "content-type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Check if user is org admin
    const isOrgAdmin = org.members?.some(
      (member) =>
        user &&
        member.user_id === user.user.user_id &&
        member.role === "org_admin"
    );

    if (!isOrgAdmin) {
      const response = new Response(
        JSON.stringify({ error: "insufficient_permissions" }),
        {
          status: 403,
          headers: { "content-type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Check if org can issue for others
    if (!org.can_issue_for_others) {
      const response = new Response(
        JSON.stringify({ error: "org_cannot_issue" }),
        {
          status: 403,
          headers: { "content-type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    const body = (await request.json()) as IssuanceRequest;

    // Validate required fields
    if (
      !body.name ||
      !body.role ||
      !body.description ||
      !body.regions ||
      !body.contact
    ) {
      const response = new Response(
        JSON.stringify({ error: "missing_required_fields" }),
        {
          status: 400,
          headers: { "content-type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Validate pending_owner if provided - email OR github_username is required
    if (body.pending_owner) {
      if (!body.pending_owner.email && !body.pending_owner.github_username) {
        const response = new Response(
          JSON.stringify({
            error: "invalid_pending_owner",
            message: "pending_owner must have either email or github_username",
          }),
          {
            status: 400,
            headers: { "content-type": "application/json", ...headers },
          }
        );

        await logger.logRequest(request, response, startTime);
        return response;
      }
    }

    // Create issuance context for delegated issuance
    const context: IssuanceContext = {
      issuer_type: "org",
      issued_by: orgId,
      provisioned_by_org_id: orgId,
      sponsor_orgs: [orgId], // Organization remains as sponsor
    };

    // Process issuance
    const result = await processIssuance(body, context, env);

    // If passport has pending_owner with email, send claim email
    if (body.pending_owner?.email && !result.claimed) {
      try {
        await sendClaimEmail(body as any, env, logger);
      } catch (error) {
        console.error("Failed to send claim email:", error);
        // Don't fail the issuance if email sending fails
      }
    }

    const response = new Response(
      JSON.stringify({
        ok: true,
        agent_id: result.agent_id,
        claimed: result.claimed,
        message: result.message,
        claim_email_sent: !!(body.pending_owner?.email && !result.claimed),
      }),
      {
        status: 201,
        headers: { "content-type": "application/json", ...headers },
      }
    );

    await logger.logRequest(request, response, startTime, {
      agentId: result.agent_id,
    });
    return response;
  } catch (error) {
    console.error("Error processing org issuance:", error);

    let status = 500;
    let errorMessage = "internal_server_error";

    if (error instanceof Error) {
      if (error.message.includes("already exists")) {
        status = 409;
        errorMessage = "agent_exists";
      } else if (error.message.includes("missing")) {
        status = 400;
        errorMessage = "missing_required_fields";
      }
    }

    const response = new Response(
      JSON.stringify({
        error: errorMessage,
        message:
          error instanceof Error ? error.message : "Failed to issue passport",
      }),
      {
        status,
        headers: { "content-type": "application/json", ...headers },
      }
    );

    await logger.logRequest(request, response, startTime);
    return response;
  }
};
