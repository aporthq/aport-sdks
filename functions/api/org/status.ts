import {
  BaseApiHandler,
  BaseEnv,
  createApiHandler,
} from "../../utils/base-api-handler";
import { cors } from "../../utils/cors";
import { OrgStatusRequest } from "../../../types/auth";
import {
  authenticateOrgKey,
  updateOrgStatus,
  getOrganization,
} from "../../utils/org-management";
import {
  createAuditAction,
  completeAuditAction,
} from "../../utils/audit-trail";

interface Env extends BaseEnv {}

/**
 * components:
 *   schemas:
 *     OrgStatusRequest:
 *       type: object
 *       required:
 *         - status
 *       properties:
 *         status:
 *           type: string
 *           enum: [active, suspended]
 *           description: New status for the organization
 *           example: "suspended"
 *     OrgStatusResponse:
 *       type: object
 *       required:
 *         - org_id
 *         - status
 *         - updated_at
 *       properties:
 *         org_id:
 *           type: string
 *           example: "ap_org_12345678"
 *         status:
 *           type: string
 *           enum: [active, suspended]
 *           example: "suspended"
 *         updated_at:
 *           type: string
 *           format: date-time
 *           example: "2025-01-15T10:30:00Z"
 */

/**
 * /api/org/status:
 *   post:
 *     summary: Update organization status
 *     description: Update organization status using organization key authentication
 *     operationId: updateOrgStatus
 *     tags:
 *       - Organizations
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OrgStatusRequest'
 *     responses:
 *       200:
 *         description: Organization status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrgStatusResponse'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized - invalid org key
 *       404:
 *         description: Organization not found
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Internal server error
 */

class UpdateOrgStatusHandler extends BaseApiHandler {
  async handleRequest(): Promise<Response> {
    // Extract organization key from Authorization header
    const authHeader = this.request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return this.unauthorized("Organization key required");
    }

    const orgKeyId = authHeader.substring(7); // Remove "Bearer " prefix

    // For organization keys, we can authenticate using just the key ID
    // since the key ID itself is the authentication token
    const orgKeyData = (await this.env.ai_passport_registry.get(
      `orgkey:${orgKeyId}`,
      "json"
    )) as any;

    if (!orgKeyData) {
      return this.unauthorized("Invalid organization key");
    }

    const authResult = { org_id: orgKeyData.org_id };

    const body: OrgStatusRequest = await this.request.json();
    const { status } = body;

    if (!status || !["active", "suspended"].includes(status)) {
      return this.badRequest("Status must be 'active' or 'suspended'");
    }

    try {
      // Check if organization exists
      const org = await getOrganization(
        this.env.ai_passport_registry,
        authResult.org_id
      );
      if (!org) {
        return this.notFound("Organization not found");
      }

      // Update organization status
      await updateOrgStatus(
        this.env.ai_passport_registry,
        authResult.org_id,
        status as any
      );

      // Audit the status change
      const auditData = await createAuditAction(
        "status_change",
        authResult.org_id,
        `org_key:${orgKeyId}`,
        {
          status_changed: {
            from: { status: (org as any).status || "active" },
            to: { status },
          },
        },
        "Organization status changed via org key",
        {
          new_status: status,
          org_name: org.name,
          org_key_id: orgKeyId,
        }
      );

      await completeAuditAction(auditData, null, this.env.REGISTRY_PRIVATE_KEY);

      return this.ok(
        {
          org_id: authResult.org_id,
          status,
          updated_at: new Date().toISOString(),
        },
        "Organization status updated successfully"
      );
    } catch (error) {
      console.error("Error updating org status:", error);
      return this.internalError("Failed to update organization status");
    }
  }
}

// Export handlers
export const onRequestOptions = async ({ request }: { request: Request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestPost = createApiHandler(UpdateOrgStatusHandler, {
  allowedMethods: ["POST"],
  requireAuth: false, // We handle auth manually with org key
  rateLimitRpm: 30, // Rate limit for org key operations
  rateLimitType: "org",
});
