/**
 * Common utilities for passport creation and management
 * Shared between admin and issuance endpoints to avoid duplication
 */

/**
 * Generate unique agent ID from name and owner/issuer
 */
export function generateAgentId(name: string, owner: string): string {
  const input = `${name}-${owner}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  // Simple hash function for demo - in production use crypto.subtle
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  const hashStr = Math.abs(hash).toString(16).substring(0, 8);
  return `ap_${hashStr}`;
}

/**
 * Generate URL-friendly slug from name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .substring(0, 50);
}

/**
 * Normalize name for uniqueness checking (best-effort)
 */
export function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ").substring(0, 100);
}

/**
 * Find unique slug by checking for collisions and appending -2, -3, etc.
 */
export async function findUniqueSlug(
  baseSlug: string,
  kv: KVNamespace,
  excludeAgentId?: string
): Promise<string> {
  let slug = baseSlug;
  let counter = 2;

  while (true) {
    const indexKey = `index:slug:${slug}`;
    const existingAgentId = await kv.get(indexKey);

    // If no collision or it's the same agent (for updates), we're good
    if (!existingAgentId || existingAgentId === excludeAgentId) {
      return slug;
    }

    // Try with counter suffix
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
}

/**
 * Check if normalized name is unique (best-effort)
 */
export async function isNameUnique(
  normalizedName: string,
  kv: KVNamespace,
  excludeAgentId?: string
): Promise<boolean> {
  const indexKey = `index:name:${normalizedName}`;
  const existingAgentId = await kv.get(indexKey);

  // If no collision or it's the same agent (for updates), it's unique
  return !existingAgentId || existingAgentId === excludeAgentId;
}

/**
 * Create or update index entries atomically
 */
export async function updateIndexes(
  kv: KVNamespace,
  agentId: string,
  slug: string,
  normalizedName: string,
  oldSlug?: string,
  oldNormalizedName?: string
): Promise<void> {
  const operations: Promise<any>[] = [];

  // Remove old indexes if they exist
  if (oldSlug) {
    operations.push(kv.delete(`index:slug:${oldSlug}`));
  }
  if (oldNormalizedName) {
    operations.push(kv.delete(`index:name:${oldNormalizedName}`));
  }

  // Add new indexes
  operations.push(kv.put(`index:slug:${slug}`, agentId));
  operations.push(kv.put(`index:name:${normalizedName}`, agentId));

  // Execute all operations in parallel
  await Promise.all(operations);
}
