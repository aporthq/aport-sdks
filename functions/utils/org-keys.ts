import { KVNamespace } from "@cloudflare/workers-types";

export interface OrgKey {
  id: string;
  agent_id: string;
  owner_email?: string;
  owner_github?: string;
  created_at: string;
  expires_at?: string;
  last_used_at?: string;
  usage_count: number;
  is_active: boolean;
}

export interface OrgKeySecret {
  key_id: string;
  hashed_secret: string; // SHA256 hash of the secret
  created_at: string;
}

/**
 * Generate a secure random org key ID
 */
export function generateOrgKeyId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 8);
  return `org_${timestamp}_${random}`;
}

/**
 * Generate a secure random org key secret
 */
export function generateOrgKeySecret(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array)).replace(
    /[+/=]/g,
    (m) => ({ "+": "-", "/": "_", "=": "" }[m] as string)
  );
}

/**
 * Hash an org key secret using SHA256
 */
export async function hashOrgKeySecret(secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(secret);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return btoa(String.fromCharCode(...hashArray));
}

/**
 * Verify an org key secret against its hash
 */
export async function verifyOrgKeySecret(
  secret: string,
  hashedSecret: string
): Promise<boolean> {
  const computedHash = await hashOrgKeySecret(secret);
  return computedHash === hashedSecret;
}

/**
 * Create a new org key for an agent
 */
export async function createOrgKey(
  kv: KVNamespace,
  agentId: string,
  ownerEmail?: string,
  ownerGithub?: string,
  expiresInDays?: number
): Promise<{ keyId: string; secret: string }> {
  const keyId = generateOrgKeyId();
  const secret = generateOrgKeySecret();
  const hashedSecret = await hashOrgKeySecret(secret);

  const now = new Date();
  const expiresAt = expiresInDays
    ? new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000)
    : undefined;

  const orgKey: OrgKey = {
    id: keyId,
    agent_id: agentId,
    owner_email: ownerEmail,
    owner_github: ownerGithub,
    created_at: now.toISOString(),
    expires_at: expiresAt?.toISOString(),
    last_used_at: undefined,
    usage_count: 0,
    is_active: true,
  };

  const orgKeySecret: OrgKeySecret = {
    key_id: keyId,
    hashed_secret: hashedSecret,
    created_at: now.toISOString(),
  };

  // Store org key and secret separately
  await Promise.all([
    kv.put(`org_key:${keyId}`, JSON.stringify(orgKey)),
    kv.put(`org_key_secret:${keyId}`, JSON.stringify(orgKeySecret)),
  ]);

  return { keyId, secret };
}

/**
 * Get org key by ID
 */
export async function getOrgKey(
  kv: KVNamespace,
  keyId: string
): Promise<OrgKey | null> {
  const keyData = await kv.get(`org_key:${keyId}`, "json");
  return keyData as OrgKey | null;
}

/**
 * Verify org key secret and return the org key
 */
export async function verifyOrgKey(
  kv: KVNamespace,
  keyId: string,
  secret: string
): Promise<OrgKey | null> {
  // Get org key
  const orgKey = await getOrgKey(kv, keyId);
  if (!orgKey || !orgKey.is_active) {
    return null;
  }

  // Check expiration
  if (orgKey.expires_at && new Date(orgKey.expires_at) < new Date()) {
    return null;
  }

  // Get and verify secret
  const secretData = (await kv.get(
    `org_key_secret:${keyId}`,
    "json"
  )) as OrgKeySecret | null;
  if (!secretData) {
    return null;
  }

  const isValid = await verifyOrgKeySecret(secret, secretData.hashed_secret);
  if (!isValid) {
    return null;
  }

  // Update usage stats
  const updatedOrgKey: OrgKey = {
    ...orgKey,
    last_used_at: new Date().toISOString(),
    usage_count: orgKey.usage_count + 1,
  };

  await kv.put(`org_key:${keyId}`, JSON.stringify(updatedOrgKey));

  return updatedOrgKey;
}

/**
 * Revoke an org key
 */
export async function revokeOrgKey(
  kv: KVNamespace,
  keyId: string
): Promise<boolean> {
  const orgKey = await getOrgKey(kv, keyId);
  if (!orgKey) {
    return false;
  }

  const updatedOrgKey: OrgKey = {
    ...orgKey,
    is_active: false,
  };

  await kv.put(`org_key:${keyId}`, JSON.stringify(updatedOrgKey));
  return true;
}

/**
 * Get all org keys for an agent
 */
export async function getOrgKeysForAgent(
  kv: KVNamespace,
  agentId: string
): Promise<OrgKey[]> {
  // This is a simplified implementation - in production you'd want to maintain an index
  // For now, we'll return an empty array as we don't have a way to list all keys efficiently
  return [];
}

/**
 * Get actor string for Verifiable Attestation
 */
export function getOrgActorString(orgKey: OrgKey): string {
  if (orgKey.owner_email) {
    return `owner:${orgKey.owner_email}`;
  }
  if (orgKey.owner_github) {
    return `owner:${orgKey.owner_github}`;
  }
  return `owner:${orgKey.agent_id}`;
}
