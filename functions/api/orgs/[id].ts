/**
 * /api/orgs/{id}:
 *   get:
 *     summary: Get organization by ID
 *     description: Returns detailed information about a specific organization
 *     operationId: getOrganization
 *     tags:
 *       - Organizations
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *           example: "ap_org_12345678"
 *     responses:
 *       200:
 *         description: Organization details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 org_id:
 *                   type: string
 *                   example: "ap_org_12345678"
 *                 name:
 *                   type: string
 *                   example: "Acme Corp"
 *                 contact_email:
 *                   type: string
 *                   example: "admin@acme.com"
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Internal server error
 */

/**
 * Get Organization by ID Endpoint
 *
 * Returns detailed information about a specific organization.
 */

import { PagesFunction } from "@cloudflare/workers-types";
import { cors } from "../../utils/cors";
import { createLogger } from "../../utils/logger";
import { AuthEnv } from "../../../types/auth";
import { authMiddleware } from "../../utils/auth-middleware";
import { getOrganization, hasOrgPermission } from "../../utils/org-management";
import { EnhancedOrg } from "../../../types/auth";
import { OrgMembership } from "../../../types/owner";

/**
 * Handle CORS preflight requests
 * OPTIONS /api/orgs/[id]
 */
export const onRequestOptions: PagesFunction<AuthEnv> = async ({ request }) => {
  const headers = cors(request);
  return new Response(null, { headers });
};

/**
 * Get organization by ID
 * GET /api/orgs/[id]
 */
export const onRequestGet: PagesFunction<AuthEnv> = async ({
  request,
  env,
  params,
}) => {
  const startTime = Date.now();
  const headers = cors(request);
  const logger = createLogger(env.ai_passport_registry);

  try {
    // Authenticate user (allow both JWT and API key)
    const authResult = await authMiddleware(request, env, {
      requireAuth: true,
      allowApiKey: true,
      requiredApiKeyScopes: ["read"],
    });

    if (!authResult.success || !authResult.user) {
      return new Response(
        JSON.stringify({
          error: authResult.error || "Authentication required",
        }),
        {
          status: 401,
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const orgId = params?.id;
    if (!orgId) {
      return new Response(
        JSON.stringify({ error: "Organization ID is required" }),
        {
          status: 400,
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Get organization data
    const orgData = await getOrganization(
      env.ai_passport_registry,
      orgId as string
    );
    if (!orgData) {
      return new Response(JSON.stringify({ error: "Organization not found" }), {
        status: 404,
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
      });
    }

    // Check if user is a member of this organization
    const userId = authResult.user.user.user_id;
    const userMembership = orgData.members?.find(
      (member) => member.user_id === userId
    );

    if (!userMembership) {
      return new Response(
        JSON.stringify({
          error: "Access denied - not a member of this organization",
        }),
        {
          status: 403,
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Log access for security auditing
    console.log(
      `User ${userId} accessing organization ${orgId} with role: ${userMembership.role}`
    );

    // Get all members for this organization
    const allMemberships = await env.ai_passport_registry.list({
      prefix: `membership:org:${orgId}:`,
    });

    const members: OrgMembership[] = [];
    for (const memberKey of allMemberships.keys) {
      const memberData = await env.ai_passport_registry.get(
        memberKey.name,
        "json"
      );
      if (memberData) {
        members.push(memberData as OrgMembership);
      }
    }

    // Create enhanced organization response
    const enhancedOrg: EnhancedOrg = {
      org_id: orgData.org_id,
      name: orgData.name,
      domain: orgData.domain,
      contact_email: orgData.contact_email,
      members: members,
      created_at: orgData.created_at,
      updated_at: orgData.updated_at,
      assurance_level: orgData.assurance_level || "L0",
      can_issue_for_others: orgData.can_issue_for_others || false,
      user_role: userMembership.role,
      org_key_id: orgData.org_key_id,
      org_key_hash: orgData.org_key_hash,
      status: orgData.status || "active",
    };

    // Add user permissions to response
    const userPermissions = {
      can_view: hasOrgPermission(userMembership.role, "view"),
      can_edit: hasOrgPermission(userMembership.role, "edit"),
      can_admin: hasOrgPermission(userMembership.role, "admin"),
      can_manage_members: hasOrgPermission(
        userMembership.role,
        "manage_members"
      ),
      can_manage_keys: hasOrgPermission(userMembership.role, "manage_keys"),
    };

    const response = new Response(
      JSON.stringify({
        ...enhancedOrg,
        user_permissions: userPermissions,
      }),
      {
        status: 200,
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
      }
    );

    await logger.logRequest(request, response, startTime, {
      agentId: userId,
    });
    return response;
  } catch (error) {
    console.error("Get organization error:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to get organization details",
      }),
      {
        status: 500,
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
      }
    );

    await logger.logRequest(request, response, startTime);
    return response;
  }
};
