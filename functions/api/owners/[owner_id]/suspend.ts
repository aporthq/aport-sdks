import {
  BaseApiHandler,
  BaseEnv,
  createApiHandler,
} from "../../../utils/base-api-handler";
import { cors } from "../../../utils/cors";
import { PassportData } from "../../../../types/passport";
import { authMiddleware } from "../../../utils/auth-middleware";
import { canSuspendOwnPassport, RBAC_ERRORS } from "../../../utils/rbac-guards";
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

interface Env extends BaseEnv {}

interface SuspendPassportRequest {
  agent_id: string;
  status: "active" | "suspended";
  reason?: string;
}

class SuspendOwnPassportHandler extends BaseApiHandler {
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

    const ownerId = this.params?.owner_id;
    if (!ownerId) {
      return this.badRequest("Owner ID is required");
    }

    // Check if user can suspend passports for this owner
    if (!canSuspendOwnPassport(authResult.user, ownerId)) {
      return this.forbidden(RBAC_ERRORS.CANNOT_SUSPEND_PASSPORT);
    }

    const body: SuspendPassportRequest = await this.request.json();
    const { agent_id, status, reason } = body;

    // Validate required fields
    if (!agent_id || !status) {
      return this.badRequest("agent_id and status are required");
    }

    // Validate status values
    if (!["active", "suspended"].includes(status)) {
      return this.badRequest("Status must be 'active' or 'suspended'");
    }

    try {
      // Get the passport
      const passport = (await this.env.ai_passport_registry.get(
        `passport:${agent_id}`,
        "json"
      )) as PassportData | null;

      if (!passport) {
        return this.notFound("Passport not found");
      }

      // Verify ownership
      if (passport.owner_id !== ownerId) {
        return this.forbidden("You can only suspend your own passports");
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
        `Passport status changed from '${previousStatus}' to '${status}' by owner${
          reason ? `: ${reason}` : ""
        }`,
        {
          agent_id,
          previous_status: previousStatus,
          new_status: status,
          reason: reason || null,
          action_type: "owner_suspend",
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
        ownerId,
        {
          createBackup: true,
          invalidateCache: true,
          preWarmCache: true,
          reason:
            reason ||
            `Status changed from '${previousStatus}' to '${status}' by owner`,
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
          updated_at: suspendResult.updatedAt,
          latency: suspendResult.latency,
          cache_invalidated: suspendResult.cacheInvalidated,
          backup_created: suspendResult.backupCreated,
        },
        `Passport ${
          status === "suspended" ? "suspended" : "reactivated"
        } successfully (${suspendResult.latency}ms)`
      );
    } catch (error) {
      console.error("Error suspending passport:", error);
      return this.internalError("Failed to update passport status");
    }
  }
}

// Export handlers
export const onRequestOptions = async ({ request }: { request: Request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestPost = createApiHandler(SuspendOwnPassportHandler, {
  allowedMethods: ["POST"],
  requireAuth: false, // We handle auth manually in the handler
  rateLimitRpm: 30,
  rateLimitType: "org",
});
