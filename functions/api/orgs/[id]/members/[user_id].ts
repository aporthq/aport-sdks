import {
  BaseApiHandler,
  BaseEnv,
  createApiHandler,
} from "../../../../utils/base-api-handler";
import { OrgRole } from "../../../../../types/auth";
import { cors } from "../../../../utils/cors";
import {
  removeOrgMember,
  hasOrgRole,
  updateMemberRole,
} from "../../../../utils/org-management";
import { authMiddleware } from "../../../../utils/auth-middleware";
import {
  createAuditAction,
  completeAuditAction,
} from "../../../../utils/audit-trail";
import { canManageOrgMembers } from "../../../../utils/rbac-guards";

interface Env extends BaseEnv {
  JWT_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_REDIRECT_URI: string;
  EMAIL_FROM: string;
  REGISTRY_PRIVATE_KEY?: string;
}

/**
 * /api/orgs/{org_id}/members/{user_id}:
 *   delete:
 *     summary: Remove organization member
 *     description: Remove a member from the organization
 *     operationId: removeOrgMember
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
 *       - in: path
 *         name: user_id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to remove
 *     responses:
 *       200:
 *         description: Member removed successfully
 *       400:
 *         description: Bad request
 *       403:
 *         description: Forbidden - insufficient permissions
 *       404:
 *         description: Organization or member not found
 *       500:
 *         description: Internal server error
 *   patch:
 *     summary: Update member role
 *     description: Update the role of an organization member
 *     operationId: updateMemberRole
 *     tags:
 *       - Organizations
 *     parameters:
 *       - in: path
 *         name: org_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *       - in: path
 *         name: user_id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [org_admin, org_member, org_issuer, org_security, org_billing, org_auditor]
 *                 description: New role for the member
 *                 example: "org_member"
 *     responses:
 *       200:
 *         description: Member role updated successfully
 *       400:
 *         description: Bad request
 *       403:
 *         description: Forbidden - insufficient permissions
 *       404:
 *         description: Organization or member not found
 *       500:
 *         description: Internal server error
 */

class RemoveMemberHandler extends BaseApiHandler {
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
    const userId = this.params?.user_id;

    if (!orgId || !userId) {
      return this.badRequest("Organization ID and User ID are required");
    }

    // Check if user can manage members
    if (!canManageOrgMembers(authResult.user, orgId)) {
      return this.forbidden("Insufficient permissions to manage members");
    }

    try {
      // Remove member
      await removeOrgMember(this.env.ai_passport_registry, orgId, userId);

      // Audit the member removal
      const auditData = await createAuditAction(
        "update",
        orgId,
        authResult.user.user.user_id,
        {
          member_removed: {
            from: { user_id: userId },
            to: null,
          },
        },
        "Member removed from organization",
        {
          removed_user_id: userId,
        }
      );

      await completeAuditAction(auditData, null, this.env.REGISTRY_PRIVATE_KEY);

      return this.ok({}, "Member removed successfully");
    } catch (error) {
      console.error("Error removing member:", error);
      return this.internalError("Failed to remove member");
    }
  }
}

class UpdateMemberRoleHandler extends BaseApiHandler {
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
    const userId = this.params?.user_id;

    if (!orgId || !userId) {
      return this.badRequest("Organization ID and User ID are required");
    }

    // Check if user can manage members
    if (!canManageOrgMembers(authResult.user, orgId)) {
      return this.forbidden("Insufficient permissions to manage members");
    }

    const body = (await this.request.json()) as { role?: string };
    const { role } = body;

    if (!role) {
      return this.badRequest("Role is required");
    }

    try {
      // Update member role
      await updateMemberRole(
        this.env.ai_passport_registry,
        orgId,
        userId,
        role as OrgRole,
        authResult.user.user.user_id
      );

      // Audit the role change
      const auditData = await createAuditAction(
        "update",
        orgId,
        authResult.user.user.user_id,
        {
          member_role_changed: {
            from: { user_id: userId, role: "previous_role" },
            to: { user_id: userId, role: role },
          },
        },
        "Member role updated",
        {
          member_user_id: userId,
          new_role: role,
        }
      );

      await completeAuditAction(auditData, null, this.env.REGISTRY_PRIVATE_KEY);

      return this.ok({}, "Member role updated successfully");
    } catch (error) {
      console.error("Error updating member role:", error);
      return this.internalError("Failed to update member role");
    }
  }
}

// Export handlers
export const onRequestOptions = async ({ request }: { request: Request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestDelete = createApiHandler(RemoveMemberHandler, {
  allowedMethods: ["DELETE"],
  requireAuth: true,
  rateLimitRpm: 60,
  rateLimitType: "org",
});

export const onRequestPatch = createApiHandler(UpdateMemberRoleHandler, {
  allowedMethods: ["PATCH"],
  requireAuth: true,
  rateLimitRpm: 60,
  rateLimitType: "org",
});
