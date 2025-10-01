import {
  ApiKey,
  ApiKeyScope,
  ApiKeyStatus,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  ApiKeyListItem,
} from "../../types/auth";
// Use Web Crypto API instead of Node.js crypto

/**
 * Generate a secure API key
 */
export function generateApiKey(): string {
  const prefix = "apk_";
  const randomPart = crypto.getRandomValues(new Uint8Array(32));
  const base64 = btoa(String.fromCharCode(...randomPart))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return `${prefix}${base64}`;
}

/**
 * Hash an API key for secure storage
 */
export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate API key ID
 */
export function generateApiKeyId(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(8));
  const hex = Array.from(randomBytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `apk_${hex}`;
}

/**
 * Create API key record
 */
export async function createApiKey(
  kv: KVNamespace,
  request: CreateApiKeyRequest
): Promise<CreateApiKeyResponse> {
  const keyId = generateApiKeyId();
  const plaintextKey = generateApiKey();
  const keyHash = await hashApiKey(plaintextKey);
  const now = new Date().toISOString();

  const apiKey: ApiKey = {
    key_id: keyId,
    owner_id: request.owner_id,
    owner_type: request.owner_type,
    scopes: request.scopes,
    hash: keyHash,
    created_at: now,
    status: "active",
    name: request.name,
  };

  // Store the API key record
  await kv.put(`apikey:${keyId}`, JSON.stringify(apiKey));

  // Create reverse index for owner lookup
  await kv.put(
    `apikey_owner:${request.owner_type}:${request.owner_id}:${keyId}`,
    keyId
  );

  return {
    key_id: keyId,
    key: plaintextKey, // Only shown once
    owner_id: request.owner_id,
    owner_type: request.owner_type,
    scopes: request.scopes,
    created_at: now,
    name: request.name,
  };
}

/**
 * Get API key by ID
 */
export async function getApiKey(
  kv: KVNamespace,
  keyId: string
): Promise<ApiKey | null> {
  const data = await kv.get(`apikey:${keyId}`, "json");
  return data as ApiKey | null;
}

/**
 * Get API key by plaintext key (for authentication)
 */
export async function getApiKeyByPlaintext(
  kv: KVNamespace,
  plaintextKey: string
): Promise<ApiKey | null> {
  const keyHash = await hashApiKey(plaintextKey);

  // We need to search through all API keys to find the matching hash
  // This is not efficient for large numbers of keys, but acceptable for MVP
  const { keys } = await kv.list({ prefix: "apikey:" });

  for (const key of keys) {
    const apiKey = (await kv.get(key.name, "json")) as ApiKey;
    if (apiKey && apiKey.hash === keyHash && apiKey.status === "active") {
      return apiKey;
    }
  }

  return null;
}

/**
 * List API keys for an owner
 */
export async function listApiKeys(
  kv: KVNamespace,
  ownerType: "user" | "org",
  ownerId: string
): Promise<ApiKeyListItem[]> {
  const { keys } = await kv.list({
    prefix: `apikey_owner:${ownerType}:${ownerId}:`,
  });

  const apiKeys: ApiKeyListItem[] = [];

  for (const key of keys) {
    const keyId = await kv.get(key.name);
    if (keyId) {
      const apiKey = await getApiKey(kv, keyId);
      if (apiKey) {
        apiKeys.push({
          key_id: apiKey.key_id,
          owner_id: apiKey.owner_id,
          owner_type: apiKey.owner_type,
          scopes: apiKey.scopes,
          created_at: apiKey.created_at,
          last_used_at: apiKey.last_used_at,
          status: apiKey.status,
          name: apiKey.name,
          key_prefix: plaintextKeyToPrefix(apiKey.key_id), // Use key_id as prefix since we don't store plaintext
        });
      }
    }
  }

  return apiKeys;
}

/**
 * Update API key last used timestamp
 */
export async function updateApiKeyLastUsed(
  kv: KVNamespace,
  keyId: string
): Promise<void> {
  const apiKey = await getApiKey(kv, keyId);
  if (apiKey) {
    apiKey.last_used_at = new Date().toISOString();
    await kv.put(`apikey:${keyId}`, JSON.stringify(apiKey));
  }
}

/**
 * Rotate API key (create new, revoke old)
 */
export async function rotateApiKey(
  kv: KVNamespace,
  keyId: string
): Promise<CreateApiKeyResponse> {
  const oldApiKey = await getApiKey(kv, keyId);
  if (!oldApiKey) {
    throw new Error("API key not found");
  }

  // Revoke old key
  oldApiKey.status = "revoked";
  await kv.put(`apikey:${keyId}`, JSON.stringify(oldApiKey));

  // Create new key with same scopes
  const newKey = await createApiKey(kv, {
    owner_id: oldApiKey.owner_id,
    owner_type: oldApiKey.owner_type,
    scopes: oldApiKey.scopes,
    name: oldApiKey.name,
  });

  return newKey;
}

/**
 * Revoke API key
 */
export async function revokeApiKey(
  kv: KVNamespace,
  keyId: string
): Promise<void> {
  const apiKey = await getApiKey(kv, keyId);
  if (apiKey) {
    apiKey.status = "revoked";
    await kv.put(`apikey:${keyId}`, JSON.stringify(apiKey));
  }
}

/**
 * Activate API key (re-enable revoked key)
 */
export async function activateApiKey(
  kv: KVNamespace,
  keyId: string
): Promise<void> {
  const apiKey = await getApiKey(kv, keyId);
  if (apiKey) {
    apiKey.status = "active";
    await kv.put(`apikey:${keyId}`, JSON.stringify(apiKey));
  }
}

/**
 * Delete API key completely
 */
export async function deleteApiKey(
  kv: KVNamespace,
  keyId: string
): Promise<void> {
  const apiKey = await getApiKey(kv, keyId);
  if (apiKey) {
    // Delete the API key record
    await kv.delete(`apikey:${keyId}`);

    // Remove from owner index
    const ownerIndexKey = `apikey_owner:${apiKey.owner_type}:${apiKey.owner_id}:${keyId}`;
    await kv.delete(ownerIndexKey);
  }
}

/**
 * Check if API key has required scope
 */
export function hasApiKeyScope(
  apiKey: ApiKey,
  requiredScope: ApiKeyScope
): boolean {
  return apiKey.scopes.includes(requiredScope);
}

/**
 * Check if API key has any of the required scopes
 */
export function hasAnyApiKeyScope(
  apiKey: ApiKey,
  requiredScopes: ApiKeyScope[]
): boolean {
  return requiredScopes.some((scope) => apiKey.scopes.includes(scope));
}

/**
 * Convert key ID to prefix for display
 */
function plaintextKeyToPrefix(keyId: string): string {
  return keyId.substring(0, 8) + "...";
}

/**
 * Validate API key scopes
 */
export function validateApiKeyScopes(scopes: ApiKeyScope[]): boolean {
  const validScopes: ApiKeyScope[] = [
    "issue",
    "update",
    "status",
    "read",
    "list_agents",
    "read_audit",
    "manage_webhooks",
    "manage_keys",
  ];

  return scopes.every((scope) => validScopes.includes(scope));
}
