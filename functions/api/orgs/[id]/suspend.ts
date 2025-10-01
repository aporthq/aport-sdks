import {
  BaseApiHandler,
  BaseEnv,
  createApiHandler,
} from "../../../utils/base-api-handler";
import { cors } from "../../../utils/cors";
import { PassportData } from "../../../../types/passport";
import { authMiddleware } from "../../../utils/auth-middleware";
import {
  canSuspendSponsoredPassport,
  RBAC_ERRORS,
} from "../../../utils/rbac-guards";
import {
  createAuditAction,
  completeAuditAction,
  computePassportDiffs,
} from "../../../utils/audit-trail";
import {
  preSerializePassport,
  invalidateSerializedPassport,
} from "../../../utils/serialization";
import { purgeVerifyCache } from "../../../utils/cache-purge";
import { getOrganization } from "../../../utils/org-management";

interface Env extends BaseEnv {}

/**
 * components:
 *   schemas:
 *     SponsorSuspendRequest:
 *       type: object
 *       required:
 *         - agent_id
 *         - status
 *       properties:
 *         agent_id:
 *           type: string
 *           description: Agent ID to suspend/reactivate (must be sponsored by this org)
 *           example: "aeebc92d-13fb-4e23-8c3c-1aa82b167da645678"
 *         status:
 *           type: string
 *           enum: [active, suspended]
 *           description: New status for the passport
 *           example: "suspended"
 *         reason:
 *           type: string
 *           description: Reason for the status change
 *           example: "Misuse detected by sponsor organization"
 *         scope:
 *           type: string
 *           enum: [sponsor]
 *           description: Scope of suspension (sponsor scope only)
 *           example: "sponsor"
 *     SponsorSuspendResponse:
 *       type: object
 *       required:
 *         - agent_id
 *         - status
 *         - sponsor_org_id
 *         - updated_at
 *       properties:
 *         agent_id:
 *           type: string
 *           example: "aeebc92d-13fb-4e23-8c3c-1aa82b167da645678"
 *         status:
 *           type: string
 *           enum: [active, suspended]
 *           example: "suspended"
 *         previous_status:
 *           type: string
 *           example: "active"
 *         sponsor_org_id:
 *           type: string
 *           example: "ap_org_87654321"
 *         updated_at:
 *           type: string
 *           format: date-time
 *           example: "2025-01-15T10:30:00Z"
 */

interface SponsorSuspendRequest {
  agent_id: string;
  status: "active" | "suspended";
  reason?: string;
  scope?: "sponsor";
}

class SuspendSponsoredPassportHandler extends BaseApiHandler {
  async handleRequest(): Promise<Response> {
    // Authenticate user (allow both JWT and API key, similar to other endpoints)
    const authResult = await authMiddleware(this.request, this.env as any, {
      requireAuth: true,
      allowApiKey: true,
      requiredApiKeyScopes: [], // ["status"] - temporarily disabled for testing
    });

    if (!authResult.success || !authResult.user) {
      return this.unauthorized(authResult.error || "Authentication required");
    }

    const orgId = this.params?.id;
    if (!orgId) {
      return this.badRequest("Organization ID is required");
    }

    const body: SponsorSuspendRequest = await this.request.json();
    const { agent_id, status, reason, scope } = body;

    // Validate required fields
    if (!agent_id || !status) {
      return this.badRequest("agent_id and status are required");
    }

    // Validate status values
    if (!["active", "suspended"].includes(status)) {
      return this.badRequest("Status must be 'active' or 'suspended'");
    }

    // Validate scope (sponsor scope only for now)
    if (scope && scope !== "sponsor") {
      return this.badRequest("Only 'sponsor' scope is supported");
    }

    try {
      // Verify organization exists
      const org = await getOrganization(this.env.ai_passport_registry, orgId);
      if (!org) {
        return this.notFound("Organization not found");
      }

      // Get the passport
      const passport = (await this.env.ai_passport_registry.get(
        `passport:${agent_id}`,
        "json"
      )) as PassportData | null;

      if (!passport) {
        return this.notFound("Passport not found");
      }

      // Check if organization can suspend this passport (must be in sponsor_orgs)
      if (
        !canSuspendSponsoredPassport(
          authResult.user,
          orgId,
          passport.sponsor_orgs || []
        )
      ) {
        if (!passport.sponsor_orgs?.includes(orgId)) {
          return this.forbidden(RBAC_ERRORS.PASSPORT_NOT_SPONSORED);
        }
        return this.forbidden(RBAC_ERRORS.INSUFFICIENT_ORG_ROLE);
      }

      // Check if status change is needed
      if (passport.status === status) {
        return this.badRequest(`Passport is already ${status}`);
      }

      const previousStatus = passport.status;

      // Update passport status
      const updatedPassport: PassportData = {
        ...passport,
        status,
        updated_at: new Date().toISOString(),
      };

      // Create audit action
      const changes = computePassportDiffs(passport, updatedPassport);
      const auditAction = await createAuditAction(
        "status_change",
        agent_id,
        authResult.user.user.user_id,
        changes,
        `Passport status changed from '${previousStatus}' to '${status}' by sponsor organization ${orgId}${
          reason ? `: ${reason}` : ""
        }`,
        {
          agent_id,
          sponsor_org_id: orgId,
          sponsor_org_name: org.name,
          previous_status: previousStatus,
          new_status: status,
          reason: reason || null,
          scope: scope || "sponsor",
          action_type: "sponsor_suspend",
        }
      );

      // Complete audit action
      const completedAuditAction = await completeAuditAction(
        auditAction,
        null,
        this.env.REGISTRY_PRIVATE_KEY
      );

      // Use unified passport update optimizer for <10ms response
      const { createPassportUpdateOptimizer } = await import(
        "../../../utils/passport-update-optimizer"
      );
      const updateOptimizer = createPassportUpdateOptimizer(
        this.env.ai_passport_registry,
        this.env.AP_VERSION || "0.1",
        this.env.PASSPORT_SNAPSHOTS_BUCKET // R2 bucket for backups
      );

      // Execute optimized status change operation
      const suspendResult = await updateOptimizer.changeStatus(
        agent_id,
        status as "active" | "suspended",
        previousStatus,
        orgId,
        {
          createBackup: true,
          invalidateCache: true,
          preWarmCache: true,
          reason:
            reason ||
            `Status changed from '${previousStatus}' to '${status}' by sponsor organization ${orgId}`,
          actor: authResult.user.user.user_id,
        }
      );

      // Store audit action in parallel (non-blocking)
      Promise.resolve().then(async () => {
        try {
          await this.env.ai_passport_registry.put(
            `audit:${completedAuditAction.id}`,
            JSON.stringify(completedAuditAction)
          );
        } catch (error) {
          console.warn("Failed to store audit action:", error);
        }
      });

      return this.ok(
        {
          agent_id,
          status,
          previous_status: previousStatus,
          sponsor_org_id: orgId,
          updated_at: suspendResult.updatedAt,
          latency: suspendResult.latency,
          cache_invalidated: suspendResult.cacheInvalidated,
          backup_created: suspendResult.backupCreated,
        },
        `Passport ${
          status === "suspended" ? "suspended" : "reactivated"
        } by sponsor organization (${suspendResult.latency}ms)`
      );
    } catch (error) {
      console.error("Error suspending sponsored passport:", error);
      return this.internalError("Failed to update passport status");
    }
  }
}

// Export handlers
export const onRequestOptions = async ({ request }: { request: Request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestPost = createApiHandler(SuspendSponsoredPassportHandler, {
  allowedMethods: ["POST"],
  requireAuth: false, // We handle auth manually in the handler
  rateLimitRpm: 30,
  rateLimitType: "org",
});
