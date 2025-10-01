import {
  BaseApiHandler,
  BaseEnv,
  createApiHandler,
} from "../../../utils/base-api-handler";
import { cors } from "../../../utils/cors";
import {
  setOrgIssuerFlag,
  getOrganization,
} from "../../../utils/org-management";
import { authMiddleware } from "../../../utils/auth-middleware";
import {
  createAuditAction,
  completeAuditAction,
} from "../../../utils/audit-trail";
import { canSetIssuerFlag } from "../../../utils/rbac-guards";

interface Env extends BaseEnv {}

/**
 * components:
 *   schemas:
 *     SetIssuerFlagRequest:
 *       type: object
 *       required:
 *         - can_issue_for_others
 *       properties:
 *         can_issue_for_others:
 *           type: boolean
 *           description: Whether the organization can issue passports for others
 *           example: true
 */

/**
 * /api/orgs/{org_id}/issuer:
 *   patch:
 *     summary: Set organization issuer flag
 *     description: Grant or revoke an organization's permission to issue passports for others (registry admin only)
 *     operationId: setOrgIssuerFlag
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
 *             $ref: '#/components/schemas/SetIssuerFlagRequest'
 *     responses:
 *       200:
 *         description: Issuer flag updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 org_id:
 *                   type: string
 *                   example: "ap_org_12345678"
 *                 can_issue_for_others:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Bad request
 *       403:
 *         description: Forbidden - registry admin required
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Internal server error
 *   get:
 *     summary: Get organization issuer status
 *     description: Get whether the organization can issue passports for others
 *     operationId: getOrgIssuerStatus
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
 *         description: Organization issuer status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 org_id:
 *                   type: string
 *                   example: "ap_org_12345678"
 *                 can_issue_for_others:
 *                   type: boolean
 *                   example: true
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Internal server error
 */

class SetIssuerFlagHandler extends BaseApiHandler {
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

    // Check if user can set issuer flag (registry admin only)
    if (!canSetIssuerFlag(authResult.user)) {
      return this.forbidden("Registry admin permissions required");
    }

    const body = (await this.request.json()) as {
      can_issue_for_others?: boolean;
    };
    const { can_issue_for_others } = body;

    if (typeof can_issue_for_others !== "boolean") {
      return this.badRequest("can_issue_for_others must be a boolean");
    }

    try {
      // Check if organization exists
      const org = await getOrganization(this.env.ai_passport_registry, orgId);
      if (!org) {
        return this.notFound("Organization not found");
      }

      // Set issuer flag
      await setOrgIssuerFlag(
        this.env.ai_passport_registry,
        orgId,
        can_issue_for_others
      );

      // Audit the issuer flag change
      const auditData = await createAuditAction(
        "update",
        orgId,
        authResult.user.user.user_id,
        {
          issuer_flag_changed: {
            from: { can_issue_for_others: org.can_issue_for_others || false },
            to: { can_issue_for_others },
          },
        },
        "Organization issuer flag updated",
        {
          can_issue_for_others,
          org_name: org.name,
        }
      );

      await completeAuditAction(auditData, null, this.env.REGISTRY_PRIVATE_KEY);

      return this.ok(
        {
          org_id: orgId,
          can_issue_for_others,
        },
        "Issuer flag updated successfully"
      );
    } catch (error) {
      console.error("Error setting issuer flag:", error);
      return this.internalError("Failed to set issuer flag");
    }
  }
}

class GetIssuerStatusHandler extends BaseApiHandler {
  async handleRequest(): Promise<Response> {
    const orgId = this.params?.org_id;
    if (!orgId) {
      return this.badRequest("Organization ID is required");
    }

    try {
      const org = await getOrganization(this.env.ai_passport_registry, orgId);
      if (!org) {
        return this.notFound("Organization not found");
      }

      return this.ok(
        {
          org_id: orgId,
          can_issue_for_others: org.can_issue_for_others || false,
        },
        "Issuer status retrieved successfully"
      );
    } catch (error) {
      console.error("Error getting issuer status:", error);
      return this.internalError("Failed to get issuer status");
    }
  }
}

// Export handlers
export const onRequestOptions = async ({ request }: { request: Request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestPatch = createApiHandler(SetIssuerFlagHandler, {
  allowedMethods: ["PATCH"],
  requireAuth: true,
  rateLimitRpm: 30,
  rateLimitType: "admin",
});

export const onRequestGet = createApiHandler(GetIssuerStatusHandler, {
  allowedMethods: ["GET"],
  requireAuth: false,
  rateLimitRpm: 120,
  rateLimitType: "org",
});
