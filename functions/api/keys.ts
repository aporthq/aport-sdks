import {
  BaseApiHandler,
  BaseEnv,
  createApiHandler,
} from "../utils/base-api-handler";
import { cors } from "../utils/cors";
import { CreateApiKeyRequest, ApiKeyListItem } from "../../types/auth";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  rotateApiKey,
  validateApiKeyScopes,
} from "../utils/api-keys";
import { authMiddleware } from "../utils/auth-middleware";
import { createAuditAction, completeAuditAction } from "../utils/audit-trail";
import { canManageApiKeys } from "../utils/rbac-guards";

interface Env extends BaseEnv {}

/**
 * @swagger
 * components:
 *   schemas:
 *     CreateApiKeyRequest:
 *       type: object
 *       required:
 *         - owner_id
 *         - owner_type
 *         - scopes
 *       properties:
 *         owner_id:
 *           type: string
 *           description: ID of the user or organization
 *           example: "ap_user_12345678"
 *         owner_type:
 *           type: string
 *           enum: [user, org]
 *           description: Type of the owner
 *           example: "user"
 *         scopes:
 *           type: array
 *           items:
 *             type: string
 *             enum: [issue, update, status, read, list_agents, read_audit, manage_webhooks, manage_keys]
 *           description: API key scopes
 *           example: ["read", "list_agents"]
 *         name:
 *           type: string
 *           description: Optional human-readable name
 *           example: "My API Key"
 *     CreateApiKeyResponse:
 *       type: object
 *       required:
 *         - key_id
 *         - key
 *         - owner_id
 *         - owner_type
 *         - scopes
 *         - created_at
 *       properties:
 *         key_id:
 *           type: string
 *           example: "apk_abc123def456"
 *         key:
 *           type: string
 *           description: API key (shown only once)
 *           example: "apk_xyz789uvw012"
 *         owner_id:
 *           type: string
 *           example: "ap_user_12345678"
 *         owner_type:
 *           type: string
 *           enum: [user, org]
 *           example: "user"
 *         scopes:
 *           type: array
 *           items:
 *             type: string
 *           example: ["read", "list_agents"]
 *         created_at:
 *           type: string
 *           format: date-time
 *           example: "2025-01-15T10:30:00Z"
 *         name:
 *           type: string
 *           example: "My API Key"
 */

/**
 * @swagger
 * /api/keys:
 *   post:
 *     summary: Create API key
 *     description: Create a new API key for a user or organization
 *     operationId: createApiKey
 *     tags:
 *       - API Keys
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateApiKeyRequest'
 *     responses:
 *       201:
 *         description: API key created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreateApiKeyResponse'
 *       400:
 *         description: Bad request
 *       403:
 *         description: Forbidden - insufficient permissions
 *       500:
 *         description: Internal server error
 *   get:
 *     summary: List API keys
 *     description: List API keys for the authenticated user or organization
 *     operationId: listApiKeys
 *     tags:
 *       - API Keys
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: owner_type
 *         schema:
 *           type: string
 *           enum: [user, org]
 *         description: Filter by owner type
 *       - in: query
 *         name: owner_id
 *         schema:
 *           type: string
 *         description: Filter by owner ID
 *     responses:
 *       200:
 *         description: List of API keys
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ApiKeyListItem'
 *       400:
 *         description: Bad request
 *       403:
 *         description: Forbidden - insufficient permissions
 *       500:
 *         description: Internal server error
 */

class CreateApiKeyHandler extends BaseApiHandler {
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

    const body: CreateApiKeyRequest = await this.request.json();

    // Validate required fields
    const validationError = this.validateRequiredFields(body, [
      "owner_id",
      "owner_type",
      "scopes",
    ]);
    if (validationError) return validationError;

    // Validate scopes
    if (!validateApiKeyScopes(body.scopes)) {
      return this.badRequest("Invalid API key scopes");
    }

    // Check if user can manage API keys for this owner
    if (!canManageApiKeys(authResult.user, body.owner_id, body.owner_type)) {
      return this.forbidden("Insufficient permissions to create API key");
    }

    try {
      // Create API key
      const apiKey = await createApiKey(this.env.ai_passport_registry, body);

      // Audit the API key creation
      const auditData = await createAuditAction(
        "create",
        body.owner_type === "org" ? body.owner_id : `user:${body.owner_id}`,
        authResult.user.user.user_id,
        {
          api_key_created: {
            from: null,
            to: {
              key_id: apiKey.key_id,
              owner_id: body.owner_id,
              owner_type: body.owner_type,
              scopes: body.scopes,
              name: body.name,
            },
          },
        },
        "API key created",
        {
          key_id: apiKey.key_id,
          owner_id: body.owner_id,
          owner_type: body.owner_type,
          scopes: body.scopes,
          name: body.name,
        }
      );

      await completeAuditAction(auditData, null, this.env.REGISTRY_PRIVATE_KEY);

      return this.created(apiKey, "API key created successfully");
    } catch (error) {
      console.error("Error creating API key:", error);
      return this.internalError("Failed to create API key");
    }
  }
}

class ListApiKeysHandler extends BaseApiHandler {
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

    const url = new URL(this.request.url);
    const ownerType = url.searchParams.get("owner_type") as
      | "user"
      | "org"
      | null;
    const ownerId = url.searchParams.get("owner_id");

    // If no owner specified, default to user's own keys
    const finalOwnerType = ownerType || "user";
    const finalOwnerId = ownerId || authResult.user.user.user_id;

    // Check if user can view API keys for this owner
    if (!canManageApiKeys(authResult.user, finalOwnerId, finalOwnerType)) {
      return this.forbidden("Insufficient permissions to view API keys");
    }

    try {
      const apiKeys = await listApiKeys(
        this.env.ai_passport_registry,
        finalOwnerType,
        finalOwnerId
      );

      return this.ok(apiKeys, "API keys retrieved successfully");
    } catch (error) {
      console.error("Error listing API keys:", error);
      return this.internalError("Failed to list API keys");
    }
  }
}

// Export handlers
export const onRequestOptions = async ({ request }: { request: Request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestPost = createApiHandler(CreateApiKeyHandler, {
  allowedMethods: ["POST"],
  requireAuth: true,
  rateLimitRpm: 20, // Lower rate limit for sensitive operation
  rateLimitType: "org",
});

export const onRequestGet = createApiHandler(ListApiKeysHandler, {
  allowedMethods: ["GET"],
  requireAuth: true,
  rateLimitRpm: 120,
  rateLimitType: "org",
});
