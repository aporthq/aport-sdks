import {
  BaseApiHandler,
  BaseEnv,
  createApiHandler,
} from "../../utils/base-api-handler";
import { cors } from "../../utils/cors";
import { ApiKey } from "../../../types/auth";
import {
  getApiKey,
  revokeApiKey,
  activateApiKey,
  deleteApiKey,
  rotateApiKey,
  updateApiKeyLastUsed,
} from "../../utils/api-keys";
import { authMiddleware } from "../../utils/auth-middleware";
import {
  createAuditAction,
  completeAuditAction,
} from "../../utils/audit-trail";
import { canManageApiKeys } from "../../utils/rbac-guards";

interface Env extends BaseEnv {}

/**
 * @swagger
 * /api/keys/{key_id}:
 *   get:
 *     summary: Get API key details
 *     description: Get details of a specific API key (without the actual key)
 *     operationId: getApiKey
 *     tags:
 *       - API Keys
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key_id
 *         required: true
 *         schema:
 *           type: string
 *         description: API key ID
 *     responses:
 *       200:
 *         description: API key details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiKeyListItem'
 *       403:
 *         description: Forbidden - insufficient permissions
 *       404:
 *         description: API key not found
 *       500:
 *         description: Internal server error
 *   put:
 *     summary: Activate API key
 *     description: Activate a revoked API key (re-enable it)
 *     operationId: activateApiKey
 *     tags:
 *       - API Keys
 *     parameters:
 *       - in: path
 *         name: key_id
 *         required: true
 *         schema:
 *           type: string
 *         description: API key ID
 *     responses:
 *       200:
 *         description: API key activated successfully
 *       403:
 *         description: Forbidden - insufficient permissions
 *       404:
 *         description: API key not found
 *       500:
 *         description: Internal server error
 *   post:
 *     summary: Revoke API key
 *     description: Revoke an API key (mark as inactive but keep in database)
 *     operationId: revokeApiKey
 *     tags:
 *       - API Keys
 *     parameters:
 *       - in: path
 *         name: key_id
 *         required: true
 *         schema:
 *           type: string
 *         description: API key ID
 *     responses:
 *       200:
 *         description: API key revoked successfully
 *       403:
 *         description: Forbidden - insufficient permissions
 *       404:
 *         description: API key not found
 *       500:
 *         description: Internal server error
 *   delete:
 *     summary: Delete API key
 *     description: Delete an API key completely
 *     operationId: deleteApiKey
 *     tags:
 *       - API Keys
 *     parameters:
 *       - in: path
 *         name: key_id
 *         required: true
 *         schema:
 *           type: string
 *         description: API key ID
 *     responses:
 *       200:
 *         description: API key deleted successfully
 *       403:
 *         description: Forbidden - insufficient permissions
 *       404:
 *         description: API key not found
 *       500:
 *         description: Internal server error
 *   patch:
 *     summary: Rotate API key
 *     description: Generate a new API key and revoke the old one
 *     operationId: rotateApiKey
 *     tags:
 *       - API Keys
 *     parameters:
 *       - in: path
 *         name: key_id
 *         required: true
 *         schema:
 *           type: string
 *         description: API key ID
 *     responses:
 *       200:
 *         description: API key rotated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreateApiKeyResponse'
 *       403:
 *         description: Forbidden - insufficient permissions
 *       404:
 *         description: API key not found
 *       500:
 *         description: Internal server error
 */

class GetApiKeyHandler extends BaseApiHandler {
  async handleRequest(): Promise<Response> {
    // Authenticate user
    const authResult = await authMiddleware(this.request, this.env as any, {
      requireAuth: true,
    });

    if (!authResult.success || !authResult.user) {
      return this.unauthorized(authResult.error || "Authentication required");
    }

    const keyId = this.params?.id;
    if (!keyId) {
      return this.badRequest("API key ID is required");
    }

    try {
      const apiKey = await getApiKey(this.env.ai_passport_registry, keyId);
      if (!apiKey) {
        return this.notFound("API key not found");
      }

      // Check if user can view this API key
      if (
        !canManageApiKeys(authResult.user, apiKey.owner_id, apiKey.owner_type)
      ) {
        return this.forbidden("Insufficient permissions to view this API key");
      }

      // Update last used timestamp
      await updateApiKeyLastUsed(this.env.ai_passport_registry, keyId);

      // Return API key details without the actual key
      const apiKeyDetails = {
        key_id: apiKey.key_id,
        owner_id: apiKey.owner_id,
        owner_type: apiKey.owner_type,
        scopes: apiKey.scopes,
        created_at: apiKey.created_at,
        last_used_at: apiKey.last_used_at,
        status: apiKey.status,
        name: apiKey.name,
        key_prefix: apiKey.key_id.substring(0, 8) + "...",
      };

      return this.ok(apiKeyDetails, "API key details retrieved successfully");
    } catch (error) {
      console.error("Error getting API key:", error);
      return this.internalError("Failed to get API key");
    }
  }
}

class DeleteApiKeyHandler extends BaseApiHandler {
  async handleRequest(): Promise<Response> {
    // Authenticate user
    const authResult = await authMiddleware(this.request, this.env as any, {
      requireAuth: true,
    });

    if (!authResult.success || !authResult.user) {
      return this.unauthorized(authResult.error || "Authentication required");
    }

    const keyId = this.params?.id;
    if (!keyId) {
      return this.badRequest("API key ID is required");
    }

    try {
      const apiKey = await getApiKey(this.env.ai_passport_registry, keyId);
      if (!apiKey) {
        return this.notFound("API key not found");
      }

      // Check if user can manage this API key
      if (
        !canManageApiKeys(authResult.user, apiKey.owner_id, apiKey.owner_type)
      ) {
        return this.forbidden(
          "Insufficient permissions to delete this API key"
        );
      }

      // Delete API key completely
      await deleteApiKey(this.env.ai_passport_registry, keyId);

      // Audit the API key deletion
      const auditData = await createAuditAction(
        "delete",
        apiKey.owner_type === "org"
          ? apiKey.owner_id
          : `user:${apiKey.owner_id}`,
        authResult.user.user.user_id,
        {
          api_key_deleted: {
            from: { key_id: keyId, name: apiKey.name, scopes: apiKey.scopes },
            to: null,
          },
        },
        "API key deleted",
        {
          key_id: keyId,
          owner_id: apiKey.owner_id,
          owner_type: apiKey.owner_type,
        }
      );

      await completeAuditAction(auditData, null, this.env.REGISTRY_PRIVATE_KEY);

      return this.ok({}, "API key deleted successfully");
    } catch (error) {
      console.error("Error deleting API key:", error);
      return this.internalError("Failed to delete API key");
    }
  }
}

class RotateApiKeyHandler extends BaseApiHandler {
  async handleRequest(): Promise<Response> {
    // Authenticate user
    const authResult = await authMiddleware(this.request, this.env as any, {
      requireAuth: true,
    });

    if (!authResult.success || !authResult.user) {
      return this.unauthorized(authResult.error || "Authentication required");
    }

    const keyId = this.params?.id;
    if (!keyId) {
      return this.badRequest("API key ID is required");
    }

    try {
      const apiKey = await getApiKey(this.env.ai_passport_registry, keyId);
      if (!apiKey) {
        return this.notFound("API key not found");
      }

      // Check if user can manage this API key
      if (
        !canManageApiKeys(authResult.user, apiKey.owner_id, apiKey.owner_type)
      ) {
        return this.forbidden(
          "Insufficient permissions to rotate this API key"
        );
      }

      // Rotate API key
      const newApiKey = await rotateApiKey(
        this.env.ai_passport_registry,
        keyId
      );

      // Audit the API key rotation
      const auditData = await createAuditAction(
        "update",
        apiKey.owner_type === "org"
          ? apiKey.owner_id
          : `user:${apiKey.owner_id}`,
        authResult.user.user.user_id,
        {
          api_key_rotated: {
            from: { key_id: keyId, status: "active" },
            to: { key_id: newApiKey.key_id, status: "active" },
          },
        },
        "API key rotated",
        {
          old_key_id: keyId,
          new_key_id: newApiKey.key_id,
          owner_id: apiKey.owner_id,
          owner_type: apiKey.owner_type,
        }
      );

      await completeAuditAction(auditData, null, this.env.REGISTRY_PRIVATE_KEY);

      return this.ok(newApiKey, "API key rotated successfully");
    } catch (error) {
      console.error("Error rotating API key:", error);
      return this.internalError("Failed to rotate API key");
    }
  }
}

// Export handlers
export const onRequestOptions = async ({ request }: { request: Request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestGet = createApiHandler(GetApiKeyHandler, {
  allowedMethods: ["GET"],
  requireAuth: true,
  rateLimitRpm: 120,
  rateLimitType: "org",
});

class ActivateApiKeyHandler extends BaseApiHandler {
  private getPathParam(name: string): string | null {
    const url = new URL(this.request.url);
    const pathParts = url.pathname.split("/");
    const keyIndex = pathParts.findIndex((part) => part === "keys");
    if (keyIndex !== -1 && pathParts[keyIndex + 1]) {
      return pathParts[keyIndex + 1];
    }
    return null;
  }

  async handleRequest(): Promise<Response> {
    // Authenticate user
    const authResult = await authMiddleware(this.request, this.env as any, {
      requireAuth: true,
    });

    if (!authResult.success || !authResult.user) {
      return this.unauthorized(authResult.error || "Authentication required");
    }

    const keyId = this.getPathParam("id");
    if (!keyId) {
      return this.badRequest("API key ID is required");
    }

    try {
      // Get API key
      const apiKey = await getApiKey(this.env.ai_passport_registry, keyId);
      if (!apiKey) {
        return this.notFound("API key not found");
      }

      // Check if user can manage this API key
      if (
        !canManageApiKeys(authResult.user, apiKey.owner_id, apiKey.owner_type)
      ) {
        return this.forbidden(
          "Insufficient permissions to activate this API key"
        );
      }

      // Activate API key (re-enable revoked key)
      await activateApiKey(this.env.ai_passport_registry, keyId);

      // Audit the API key activation
      const auditData = await createAuditAction(
        "update",
        apiKey.owner_type === "org"
          ? apiKey.owner_id
          : `user:${apiKey.owner_id}`,
        authResult.user.user.user_id,
        {
          api_key_activated: {
            from: { key_id: keyId, status: "revoked" },
            to: { key_id: keyId, status: "active" },
          },
        },
        "API key activated",
        {
          key_id: keyId,
          owner_id: apiKey.owner_id,
          owner_type: apiKey.owner_type,
        }
      );

      await completeAuditAction(auditData, null, this.env.REGISTRY_PRIVATE_KEY);

      return this.ok({}, "API key activated successfully");
    } catch (error) {
      console.error("Error activating API key:", error);
      return this.internalError("Failed to activate API key");
    }
  }
}

class RevokeApiKeyHandler extends BaseApiHandler {
  private getPathParam(name: string): string | null {
    const url = new URL(this.request.url);
    const pathParts = url.pathname.split("/");
    const keyIndex = pathParts.findIndex((part) => part === "keys");
    if (keyIndex !== -1 && pathParts[keyIndex + 1]) {
      return pathParts[keyIndex + 1];
    }
    return null;
  }

  async handleRequest(): Promise<Response> {
    // Authenticate user
    const authResult = await authMiddleware(this.request, this.env as any, {
      requireAuth: true,
    });

    if (!authResult.success || !authResult.user) {
      return this.unauthorized(authResult.error || "Authentication required");
    }

    const keyId = this.getPathParam("id");
    if (!keyId) {
      return this.badRequest("API key ID is required");
    }

    try {
      // Get API key
      const apiKey = await getApiKey(this.env.ai_passport_registry, keyId);
      if (!apiKey) {
        return this.notFound("API key not found");
      }

      // Check if user can manage this API key
      if (
        !canManageApiKeys(authResult.user, apiKey.owner_id, apiKey.owner_type)
      ) {
        return this.forbidden(
          "Insufficient permissions to revoke this API key"
        );
      }

      // Revoke API key (mark as revoked but keep in database)
      await revokeApiKey(this.env.ai_passport_registry, keyId);

      // Audit the API key revocation
      const auditData = await createAuditAction(
        "update",
        apiKey.owner_type === "org"
          ? apiKey.owner_id
          : `user:${apiKey.owner_id}`,
        authResult.user.user.user_id,
        {
          api_key_revoked: {
            from: { key_id: keyId, status: "active" },
            to: { key_id: keyId, status: "revoked" },
          },
        },
        "API key revoked",
        {
          key_id: keyId,
          owner_id: apiKey.owner_id,
          owner_type: apiKey.owner_type,
        }
      );

      await completeAuditAction(auditData, null, this.env.REGISTRY_PRIVATE_KEY);

      return this.ok({}, "API key revoked successfully");
    } catch (error) {
      console.error("Error revoking API key:", error);
      return this.internalError("Failed to revoke API key");
    }
  }
}

export const onRequestDelete = createApiHandler(DeleteApiKeyHandler, {
  allowedMethods: ["DELETE"],
  requireAuth: true,
  rateLimitRpm: 30,
  rateLimitType: "org",
});

export const onRequestPut = createApiHandler(ActivateApiKeyHandler, {
  allowedMethods: ["PUT"],
  requireAuth: true,
  rateLimitRpm: 30,
  rateLimitType: "org",
});

export const onRequestPost = createApiHandler(RevokeApiKeyHandler, {
  allowedMethods: ["POST"],
  requireAuth: true,
  rateLimitRpm: 30,
  rateLimitType: "org",
});

export const onRequestPatch = createApiHandler(RotateApiKeyHandler, {
  allowedMethods: ["PATCH"],
  requireAuth: true,
  rateLimitRpm: 20, // Lower rate limit for sensitive operation
  rateLimitType: "org",
});
