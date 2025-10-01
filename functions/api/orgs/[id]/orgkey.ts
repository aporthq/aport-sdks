import {
  BaseApiHandler,
  BaseEnv,
  createApiHandler,
} from "../../../utils/base-api-handler";
import { cors } from "../../../utils/cors";
import { generateOrgKey, getOrganization } from "../../../utils/org-management";
import { authMiddleware } from "../../../utils/auth-middleware";
import {
  createAuditAction,
  completeAuditAction,
} from "../../../utils/audit-trail";
import { canGenerateOrgKey } from "../../../utils/rbac-guards";

interface Env extends BaseEnv {}

/**
 * components:
 *   schemas:
 *     OrgKeyResponse:
 *       type: object
 *       required:
 *         - org_key_id
 *         - secret
 *       properties:
 *         org_key_id:
 *           type: string
 *           description: Organization key ID
 *           example: "orgkey_abc123def456"
 *         secret:
 *           type: string
 *           description: Organization key secret (shown only once)
 *           example: "orgkey_xyz789uvw012"
 */

/**
 * /api/orgs/{org_id}/orgkey:
 *   post:
 *     summary: Generate organization key
 *     description: Generate an HMAC key for the organization to suspend/resume their agents
 *     operationId: generateOrgKey
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
 *     responses:
 *       201:
 *         description: Organization key generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrgKeyResponse'
 *       400:
 *         description: Bad request
 *       403:
 *         description: Forbidden - insufficient permissions
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Internal server error
 */

class GenerateOrgKeyHandler extends BaseApiHandler {
  async handleRequest(): Promise<Response> {
    // Authenticate user (allow both JWT and API key)
    const authResult = await authMiddleware(this.request, this.env as any, {
      requireAuth: true,
      allowApiKey: true,
      requiredApiKeyScopes: ["manage_keys"],
    });

    if (!authResult.success || !authResult.user) {
      return this.unauthorized(authResult.error || "Authentication required");
    }

    // Extract org_id from URL path
    const url = new URL(this.request.url);
    const pathParts = url.pathname.split("/");
    const orgId = pathParts[pathParts.indexOf("orgs") + 1];

    if (!orgId) {
      return this.badRequest("Organization ID is required");
    }

    // Check if user can generate org key
    if (!canGenerateOrgKey(authResult.user, orgId)) {
      return this.forbidden("Insufficient permissions to generate org key");
    }

    try {
      // Check if organization exists
      const org = await getOrganization(this.env.ai_passport_registry, orgId);
      if (!org) {
        return this.notFound("Organization not found");
      }

      // Generate org key
      const { org_key_id, secret } = await generateOrgKey(
        this.env.ai_passport_registry,
        orgId
      );

      // Audit the org key generation
      const auditData = await createAuditAction(
        "create",
        orgId,
        authResult.user.user.user_id,
        {
          org_key_generated: {
            from: null,
            to: { org_key_id, org_name: org.name },
          },
        },
        "Organization key generated",
        {
          org_key_id,
          org_name: org.name,
        }
      );

      await completeAuditAction(auditData, null, this.env.REGISTRY_PRIVATE_KEY);

      return this.created(
        {
          org_key_id,
          secret, // Only shown once
        },
        "Organization key generated successfully"
      );
    } catch (error) {
      console.error("Error generating org key:", error);
      return this.internalError("Failed to generate organization key");
    }
  }
}

// Export handlers
export const onRequestOptions = async ({ request }: { request: Request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestPost = createApiHandler(GenerateOrgKeyHandler, {
  allowedMethods: ["POST"],
  requireAuth: true,
  rateLimitRpm: 10, // Lower rate limit for sensitive operation
  rateLimitType: "org",
});
