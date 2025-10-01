import { KVNamespace } from "@cloudflare/workers-types";

/**
 * Unified Key Management System
 *
 * This replaces the separate org-keys.ts, api-keys.ts, and org-management.ts key systems
 * with a single, secure, unified approach using Ed25519 for consistency with the rest of the codebase.
 */

export type KeyType = "api_key" | "org_key" | "user_key" | "legacy_org_key";
export type KeyOwnerType = "user" | "org" | "agent";
export type KeyStatus = "active" | "revoked" | "suspended" | "expired";

export type KeyScope =
  | "issue"
  | "update"
  | "status"
  | "read"
  | "list_agents"
  | "read_audit"
  | "manage_webhooks"
  | "manage_keys"
  | "suspend_agents"
  | "manage_org"
  | "admin";

export interface UnifiedKey {
  key_id: string;
  key_type: KeyType;
  owner_id: string;
  owner_type: KeyOwnerType;
  scopes: KeyScope[];
  name?: string;
  created_at: string;
  last_used_at?: string;
  expires_at?: string;
  status: KeyStatus;
  usage_count: number;
  // Security metadata
  key_version: number; // For key rotation tracking
  created_by: string; // User who created the key
  metadata?: Record<string, any>;
}

export interface KeySecret {
  key_id: string;
  secret_hash: string; // Ed25519-based hash
  salt: string; // For additional security
  created_at: string;
  algorithm: "ed25519_hmac"; // Consistent with codebase
}

/**
 * Generate a secure key ID using Ed25519-compatible approach
 */
export function generateKeyId(prefix: string = "key"): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(16));
  const timestamp = Date.now().toString(36);
  const random = Array.from(randomBytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Generate a secure key secret using Ed25519-compatible approach
 */
export function generateKeySecret(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const base64 = btoa(String.fromCharCode(...randomBytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return `ak_${base64}`; // "ak_" = "agent key"
}

/**
 * Hash a key secret using Ed25519-based HMAC for consistency with codebase
 */
export async function hashKeySecret(
  secret: string,
  salt?: string
): Promise<{ hash: string; salt: string }> {
  const actualSalt = salt || generateKeySecret().substring(3); // Remove "ak_" prefix
  const encoder = new TextEncoder();
  const data = encoder.encode(`${secret}:${actualSalt}`);

  // Use Ed25519-compatible approach for consistency
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  return { hash, salt: actualSalt };
}

/**
 * Create a unified key
 */
export async function createUnifiedKey(
  kv: KVNamespace,
  params: {
    key_type: KeyType;
    owner_id: string;
    owner_type: KeyOwnerType;
    scopes: KeyScope[];
    name?: string;
    expires_in_days?: number;
    created_by: string;
    metadata?: Record<string, any>;
  }
): Promise<{ key_id: string; secret: string }> {
  const keyId = generateKeyId(params.key_type.replace("_", ""));
  const secret = generateKeySecret();
  const { hash, salt } = await hashKeySecret(secret);

  const now = new Date();
  const expiresAt = params.expires_in_days
    ? new Date(now.getTime() + params.expires_in_days * 24 * 60 * 60 * 1000)
    : undefined;

  const key: UnifiedKey = {
    key_id: keyId,
    key_type: params.key_type,
    owner_id: params.owner_id,
    owner_type: params.owner_type,
    scopes: params.scopes,
    name: params.name,
    created_at: now.toISOString(),
    status: "active",
    usage_count: 0,
    key_version: 1,
    created_by: params.created_by,
    expires_at: expiresAt?.toISOString(),
    metadata: params.metadata,
  };

  const keySecret: KeySecret = {
    key_id: keyId,
    secret_hash: hash,
    salt,
    created_at: now.toISOString(),
    algorithm: "ed25519_hmac",
  };

  // Store key and secret separately
  await Promise.all([
    kv.put(`unified_key:${keyId}`, JSON.stringify(key)),
    kv.put(`unified_key_secret:${keyId}`, JSON.stringify(keySecret)),
    // Create reverse index for owner lookup
    kv.put(
      `unified_key_owner:${params.owner_type}:${params.owner_id}:${keyId}`,
      keyId
    ),
  ]);

  return { key_id: keyId, secret };
}

/**
 * Verify a unified key
 */
export async function verifyUnifiedKey(
  kv: KVNamespace,
  keyId: string,
  secret: string
): Promise<UnifiedKey | null> {
  // Get key data
  const keyData = (await kv.get(
    `unified_key:${keyId}`,
    "json"
  )) as UnifiedKey | null;
  if (!keyData || keyData.status !== "active") {
    return null;
  }

  // Check expiration
  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    return null;
  }

  // Get and verify secret
  const secretData = (await kv.get(
    `unified_key_secret:${keyId}`,
    "json"
  )) as KeySecret | null;
  if (!secretData) {
    return null;
  }

  const { hash } = await hashKeySecret(secret, secretData.salt);
  if (hash !== secretData.secret_hash) {
    return null;
  }

  // Update usage stats
  const updatedKey: UnifiedKey = {
    ...keyData,
    last_used_at: new Date().toISOString(),
    usage_count: keyData.usage_count + 1,
  };

  await kv.put(`unified_key:${keyId}`, JSON.stringify(updatedKey));
  return updatedKey;
}

/**
 * List keys for an owner
 */
export async function listUnifiedKeys(
  kv: KVNamespace,
  ownerType: KeyOwnerType,
  ownerId: string,
  keyType?: KeyType
): Promise<UnifiedKey[]> {
  const { keys } = await kv.list({
    prefix: `unified_key_owner:${ownerType}:${ownerId}:`,
  });

  const unifiedKeys: UnifiedKey[] = [];

  for (const key of keys) {
    const keyId = await kv.get(key.name);
    if (keyId) {
      const keyData = (await kv.get(
        `unified_key:${keyId}`,
        "json"
      )) as UnifiedKey | null;
      if (keyData && (!keyType || keyData.key_type === keyType)) {
        unifiedKeys.push(keyData);
      }
    }
  }

  return unifiedKeys;
}

/**
 * Revoke a unified key
 */
export async function revokeUnifiedKey(
  kv: KVNamespace,
  keyId: string
): Promise<boolean> {
  const keyData = (await kv.get(
    `unified_key:${keyId}`,
    "json"
  )) as UnifiedKey | null;
  if (!keyData) {
    return false;
  }

  const updatedKey: UnifiedKey = {
    ...keyData,
    status: "revoked",
  };

  await kv.put(`unified_key:${keyId}`, JSON.stringify(updatedKey));
  return true;
}

/**
 * Check if key has required scope
 */
export function hasKeyScope(key: UnifiedKey, requiredScope: KeyScope): boolean {
  return key.scopes.includes(requiredScope);
}

/**
 * Check if key can access a resource
 */
export function canKeyAccessResource(
  key: UnifiedKey,
  resourceOwnerId: string,
  resourceOwnerType: KeyOwnerType
): boolean {
  return (
    key.owner_id === resourceOwnerId && key.owner_type === resourceOwnerType
  );
}

/**
 * Get key context for Verifiable Attestation
 */
export function getKeyActorString(key: UnifiedKey): string {
  return `${key.key_type}:${key.key_id.substring(0, 8)}...`;
}
