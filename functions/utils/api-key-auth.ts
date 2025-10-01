import { ApiKey, ApiKeyScope } from "../../types/auth";
import { getApiKeyByPlaintext, updateApiKeyLastUsed } from "./api-keys";

/**
 * API Key authentication result
 */
export interface ApiKeyAuthResult {
  success: boolean;
  apiKey?: ApiKey;
  error?: string;
  statusCode?: number;
}

/**
 * API Key authentication middleware
 */
export async function apiKeyAuthMiddleware(
  request: Request,
  kv: KVNamespace,
  requiredScopes: ApiKeyScope[] = []
): Promise<ApiKeyAuthResult> {
  // Extract API key from Authorization header
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      success: false,
      error: "API key required",
      statusCode: 401,
    };
  }

  const apiKey = authHeader.substring(7); // Remove "Bearer " prefix

  try {
    // Get API key from storage
    const apiKeyData = await getApiKeyByPlaintext(kv, apiKey);
    if (!apiKeyData) {
      return {
        success: false,
        error: "Invalid API key",
        statusCode: 401,
      };
    }

    // Check if API key is active
    if (apiKeyData.status !== "active") {
      return {
        success: false,
        error: "API key has been revoked",
        statusCode: 401,
      };
    }

    // Check required scopes
    if (requiredScopes.length > 0) {
      const hasRequiredScopes = requiredScopes.every((scope) =>
        apiKeyData.scopes.includes(scope)
      );

      if (!hasRequiredScopes) {
        return {
          success: false,
          error: "API key lacks required scopes",
          statusCode: 403,
        };
      }
    }

    // Update last used timestamp (async, don't wait)
    updateApiKeyLastUsed(kv, apiKeyData.key_id).catch((error) => {
      console.error("Error updating API key last used:", error);
    });

    return {
      success: true,
      apiKey: apiKeyData,
    };
  } catch (error) {
    console.error("API key authentication error:", error);
    return {
      success: false,
      error: "API key authentication failed",
      statusCode: 500,
    };
  }
}

/**
 * Check if API key can access a specific resource
 */
export function canApiKeyAccessResource(
  apiKey: ApiKey,
  resourceOwnerId: string,
  resourceOwnerType: "user" | "org"
): boolean {
  return (
    apiKey.owner_id === resourceOwnerId &&
    apiKey.owner_type === resourceOwnerType
  );
}

/**
 * Get API key context for logging
 */
export function getApiKeyContext(apiKey: ApiKey) {
  return {
    key_id: apiKey.key_id,
    owner_id: apiKey.owner_id,
    owner_type: apiKey.owner_type,
    scopes: apiKey.scopes,
  };
}
