import {
  BaseApiHandler,
  BaseEnv,
  createApiHandler,
} from "../../../utils/base-api-handler";
import { cors } from "../../../utils/cors";
import { PassportData } from "../../../../types/passport";
import { authMiddleware } from "../../../utils/auth-middleware";
import { canUpdateOwnPassport, RBAC_ERRORS } from "../../../utils/rbac-guards";
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

class UpdateOwnPassportHandler extends BaseApiHandler {
  async handleRequest(): Promise<Response> {
    // Authenticate user (allow both JWT and API key, similar to other endpoints)
    const authResult = await authMiddleware(this.request, this.env as any, {
      requireAuth: true,
      allowApiKey: true,
      requiredApiKeyScopes: [], // ["update"] - temporarily disabled for testing
    });

    if (!authResult.success || !authResult.user) {
      return this.unauthorized(authResult.error || "Authentication required");
    }

    const ownerId = this.params?.owner_id;
    if (!ownerId) {
      return this.badRequest("Owner ID is required");
    }

    // Check if user can update passports for this owner
    if (!canUpdateOwnPassport(authResult.user, ownerId)) {
      return this.forbidden(RBAC_ERRORS.CANNOT_ACCESS_RESOURCE);
    }

    const body: Partial<PassportData> & { agent_id: string } =
      await this.request.json();
    const { agent_id } = body;

    // Validate required fields
    if (!agent_id) {
      return this.badRequest("agent_id is required");
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
        return this.forbidden("You can only update your own passports");
      }

      // Create updated passport
      const updatedPassport: PassportData = {
        ...passport,
        ...body,
        agent_id, // Ensure agent_id is not changed
        updated_at: new Date().toISOString(),
      };

      // Create audit action
      const changes = computePassportDiffs(passport, updatedPassport);
      const auditAction = await createAuditAction(
        "update",
        agent_id,
        authResult.user.user.user_id,
        changes,
        `Passport updated by owner`,
        {
          agent_id,
          action_type: "owner_update",
        }
      );

      // Complete audit action
      const completedAuditAction = await completeAuditAction(
        auditAction,
        null,
        this.env.REGISTRY_PRIVATE_KEY
      );

      // Use unified passport update optimizer for optimized update
      const { createPassportUpdateOptimizer } = await import(
        "../../../utils/passport-update-optimizer"
      );
      const updateOptimizer = createPassportUpdateOptimizer(
        this.env.ai_passport_registry,
        this.env.AP_VERSION || "0.1",
        this.env.PASSPORT_SNAPSHOTS_BUCKET // R2 bucket for backups
      );

      // Update passport with backup
      const updateResult = await updateOptimizer.updatePassport(
        agent_id,
        updatedPassport,
        passport,
        {
          createBackup: true,
          invalidateCache: true,
          preWarmCache: true,
          reason: "Passport updated by owner",
          actor: authResult.user.user.user_id,
        }
      );

      // Update related data in parallel
      await Promise.all([
        // Invalidate and re-serialize for consistency
        invalidateSerializedPassport(this.env.ai_passport_registry, agent_id),
        preSerializePassport(
          this.env.ai_passport_registry,
          agent_id,
          updatedPassport,
          this.env.AP_VERSION || "0.1"
        ),
        // Store audit action
        this.env.ai_passport_registry.put(
          `audit:${completedAuditAction.id}`,
          JSON.stringify(completedAuditAction)
        ),
        // Purge verify cache
        purgeVerifyCache(
          agent_id,
          this.env.APP_BASE_URL || "https://aport.io",
          this.env.CLOUDFLARE_API_TOKEN,
          this.env.CLOUDFLARE_ZONE_ID
        ),
      ]);

      return this.ok(
        {
          agent_id,
          updated_at: updateResult.updatedAt,
          latency: updateResult.latency,
          cache_invalidated: updateResult.cacheInvalidated,
          backup_created: updateResult.backupCreated,
        },
        "Passport updated successfully"
      );
    } catch (error) {
      console.error("Error updating passport:", error);
      return this.internalError("Failed to update passport");
    }
  }
}

// Export handlers
export const onRequestOptions = async ({ request }: { request: Request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestPatch = createApiHandler(UpdateOwnPassportHandler, {
  allowedMethods: ["PATCH"],
  requireAuth: false, // We handle auth manually in the handler
  rateLimitRpm: 30,
  rateLimitType: "org",
});
