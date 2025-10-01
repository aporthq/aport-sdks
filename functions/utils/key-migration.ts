import { KVNamespace } from "@cloudflare/workers-types";
import {
  createUnifiedKey,
  verifyUnifiedKey,
  listUnifiedKeys,
  UnifiedKey,
  KeyType,
  KeyOwnerType,
  KeyScope,
} from "./unified-key-management";

/**
 * Migration utilities to transition from multiple key systems to unified system
 */

/**
 * Migrate existing API keys to unified system
 */
export async function migrateApiKeys(kv: KVNamespace): Promise<number> {
  const { keys } = await kv.list({ prefix: "apikey:" });
  let migrated = 0;

  for (const key of keys) {
    const apiKey = (await kv.get(key.name, "json")) as any;
    if (apiKey) {
      // Convert to unified key
      const scopes: KeyScope[] = apiKey.scopes.map((scope: string) => {
        // Map existing scopes to unified scopes
        const scopeMap: Record<string, KeyScope> = {
          issue: "issue",
          update: "update",
          status: "status",
          read: "read",
          list_agents: "list_agents",
          read_audit: "read_audit",
          manage_webhooks: "manage_webhooks",
          manage_keys: "manage_keys",
        };
        return scopeMap[scope] || "read";
      });

      await createUnifiedKey(kv, {
        key_type: "api_key",
        owner_id: apiKey.owner_id,
        owner_type: apiKey.owner_type,
        scopes,
        name: apiKey.name,
        created_by: `migration:${apiKey.key_id}`,
        metadata: {
          migrated_from: "api_keys",
          original_key_id: apiKey.key_id,
        },
      });

      migrated++;
    }
  }

  return migrated;
}

/**
 * Migrate existing org keys to unified system
 */
export async function migrateOrgKeys(kv: KVNamespace): Promise<number> {
  const { keys } = await kv.list({ prefix: "orgkey:" });
  let migrated = 0;

  for (const key of keys) {
    const orgKey = (await kv.get(key.name, "json")) as any;
    if (orgKey) {
      await createUnifiedKey(kv, {
        key_type: "org_key",
        owner_id: orgKey.org_id,
        owner_type: "org",
        scopes: ["suspend_agents", "manage_org"],
        name: `Org Key for ${orgKey.org_id}`,
        created_by: `migration:${orgKey.org_id}`,
        metadata: {
          migrated_from: "org_keys",
          original_org_id: orgKey.org_id,
        },
      });

      migrated++;
    }
  }

  return migrated;
}

/**
 * Create backward compatibility layer
 */
export class KeyCompatibilityLayer {
  constructor(private kv: KVNamespace) {}

  /**
   * Verify key with fallback to old systems
   */
  async verifyKey(keyId: string, secret: string): Promise<UnifiedKey | null> {
    // Try unified system first
    const unifiedKey = await verifyUnifiedKey(this.kv, keyId, secret);
    if (unifiedKey) {
      return unifiedKey;
    }

    // Fallback to old API key system
    const { getApiKeyByPlaintext } = await import("./api-keys");
    const oldApiKey = await getApiKeyByPlaintext(this.kv, secret);
    if (oldApiKey) {
      // Convert to unified format
      return {
        key_id: oldApiKey.key_id,
        key_type: "api_key",
        owner_id: oldApiKey.owner_id,
        owner_type: oldApiKey.owner_type,
        scopes: oldApiKey.scopes as KeyScope[],
        name: oldApiKey.name,
        created_at: oldApiKey.created_at,
        last_used_at: oldApiKey.last_used_at,
        status: oldApiKey.status as any,
        usage_count: 0,
        key_version: 1,
        created_by: "legacy",
        metadata: { legacy: true },
      };
    }

    // Fallback to old org key system
    const { verifyOrgKey } = await import("./org-keys");
    const oldOrgKey = await verifyOrgKey(this.kv, keyId, secret);
    if (oldOrgKey) {
      return {
        key_id: oldOrgKey.id,
        key_type: "org_key",
        owner_id: oldOrgKey.agent_id,
        owner_type: "agent",
        scopes: ["suspend_agents"],
        name: `Legacy Org Key`,
        created_at: oldOrgKey.created_at,
        last_used_at: oldOrgKey.last_used_at,
        status: oldOrgKey.is_active ? "active" : "revoked",
        usage_count: oldOrgKey.usage_count,
        key_version: 1,
        created_by: "legacy",
        metadata: { legacy: true },
      };
    }

    return null;
  }
}
