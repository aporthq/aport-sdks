import {
  BaseApiHandler,
  BaseEnv,
  createApiHandler,
} from "../../../utils/base-api-handler";
import { cors } from "../../../utils/cors";
import { ManageMemberRequest } from "../../../../types/auth";
import { OrgMembership } from "../../../../types/owner";
import {
  addOrgMember,
  removeOrgMember,
  updateMemberRole,
  getOrgMembers,
  hasOrgRole,
} from "../../../utils/org-management";
import { authMiddleware } from "../../../utils/auth-middleware";
import {
  createAuditAction,
  completeAuditAction,
} from "../../../utils/audit-trail";
import { canManageOrgMembers } from "../../../utils/rbac-guards";

interface Env extends BaseEnv {
  JWT_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_REDIRECT_URI: string;
  EMAIL_FROM: string;
  REGISTRY_PRIVATE_KEY?: string;
}

/**
 * components:
 *   schemas:
 *     ManageMemberRequest:
 *       type: object
 *       required:
 *         - user_id
 *         - role
 *       properties:
 *         user_id:
 *           type: string
 *           description: User ID to add/update
 *           example: "ap_user_12345678"
 *         role:
 *           type: string
 *           enum: [org_admin, org_member, org_issuer, org_security, org_billing, org_auditor]
 *           description: Member role
 *           example: "org_admin"
 *     OrgMembership:
 *       type: object
 *       required:
 *         - org_id
 *         - user_id
 *         - role
 *         - added_at
 *         - added_by
 *       properties:
 *         org_id:
 *           type: string
 *           example: "ap_org_12345678"
 *         user_id:
 *           type: string
 *           example: "ap_user_12345678"
 *         role:
 *           type: string
 *           enum: [org_admin, org_member, org_issuer, org_security, org_billing, org_auditor]
 *           example: "org_admin"
 *         added_at:
 *           type: string
 *           format: date-time
 *           example: "2025-01-15T10:30:00Z"
 *         added_by:
 *           type: string
 *           example: "ap_user_87654321"
 */

/**
 * /api/orgs/{org_id}/members:
 *   post:
 *     summary: Add or update organization member
 *     description: Add a new member to the organization or update their role
 *     operationId: addOrgMember
 *     tags:
 *       - Organizations
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: org_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ManageMemberRequest'
 *     responses:
 *       200:
 *         description: Member added/updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrgMembership'
 *       400:
 *         description: Bad request
 *       403:
 *         description: Forbidden - insufficient permissions
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Internal server error
 *   get:
 *     summary: List organization members
 *     description: Get all members of the organization
 *     operationId: listOrgMembers
 *     tags:
 *       - Organizations
 *     parameters:
 *       - in: path
 *         name: org_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *     responses:
 *       200:
 *         description: List of organization members
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/OrgMembership'
 *       403:
 *         description: Forbidden - insufficient permissions
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Internal server error
 */

class AddMemberHandler extends BaseApiHandler {
  async handleRequest(): Promise<Response> {
    // Authenticate user (allow both JWT and API key)
    const authResult = await authMiddleware(this.request, this.env as any, {
      requireAuth: true,
      allowApiKey: true,
      requiredApiKeyScopes: ["read"],
    });

    if (!authResult.success || !authResult.user) {
      return this.unauthorized(authResult.error || "Authentication required");
    }

    const orgId = this.params?.org_id;
    if (!orgId) {
      return this.badRequest("Organization ID is required");
    }

    // Check if user can manage members
    if (!canManageOrgMembers(authResult.user, orgId)) {
      return this.forbidden("Insufficient permissions to manage members");
    }

    const body: ManageMemberRequest = await this.request.json();

    // Validate required fields
    const validationError = this.validateRequiredFields(body, [
      "user_id",
      "role",
    ]);
    if (validationError) return validationError;

    try {
      // Add or update member
      await addOrgMember(
        this.env.ai_passport_registry,
        orgId,
        body.user_id,
        body.role,
        authResult.user.user.user_id
      );

      // Get the membership record
      const membership: OrgMembership = {
        org_id: orgId,
        user_id: body.user_id,
        role: body.role,
        added_at: new Date().toISOString(),
        added_by: authResult.user.user.user_id,
      };

      // Audit the member addition
      const auditData = await createAuditAction(
        "create",
        orgId, // Using org_id as agent_id for org operations
        authResult.user.user.user_id,
        {
          member_added: {
            from: null,
            to: { user_id: body.user_id, role: body.role },
          },
        },
        "Member added to organization",
        {
          member_user_id: body.user_id,
          role: body.role,
        }
      );

      await completeAuditAction(auditData, null, this.env.REGISTRY_PRIVATE_KEY);

      return this.ok(membership, "Member added successfully");
    } catch (error) {
      console.error("Error adding member:", error);
      return this.internalError("Failed to add member");
    }
  }
}

class ListMembersHandler extends BaseApiHandler {
  async handleRequest(): Promise<Response> {
    // Authenticate user (allow both JWT and API key)
    const authResult = await authMiddleware(this.request, this.env as any, {
      requireAuth: true,
      allowApiKey: true,
      requiredApiKeyScopes: ["read"],
    });

    if (!authResult.success || !authResult.user) {
      return this.unauthorized(authResult.error || "Authentication required");
    }

    const orgId = this.params?.org_id;
    if (!orgId) {
      return this.badRequest("Organization ID is required");
    }

    // Check if user has access to the organization
    const hasAccess = await hasOrgRole(
      this.env.ai_passport_registry,
      authResult.user.user.user_id,
      orgId,
      [
        "org_admin",
        "org_member",
        "org_issuer",
        "org_security",
        "org_billing",
        "org_auditor",
      ]
    );

    if (!hasAccess) {
      return this.forbidden("Insufficient permissions to view members");
    }

    try {
      const members = await getOrgMembers(this.env.ai_passport_registry, orgId);
      return this.ok(members, "Members retrieved successfully");
    } catch (error) {
      console.error("Error listing members:", error);
      return this.internalError("Failed to list members");
    }
  }
}

// Export handlers
export const onRequestOptions = async ({ request }: { request: Request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestPost = createApiHandler(AddMemberHandler, {
  allowedMethods: ["POST"],
  requireAuth: true,
  rateLimitRpm: 60,
  rateLimitType: "org",
});

export const onRequestGet = createApiHandler(ListMembersHandler, {
  allowedMethods: ["GET"],
  requireAuth: true,
  rateLimitRpm: 120,
  rateLimitType: "org",
});
