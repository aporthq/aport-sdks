import { KVNamespace } from "@cloudflare/workers-types";
import { PassportData } from "../../types/passport";

export interface AuditAction {
  id: string;
  type:
    | "create"
    | "update"
    | "status_change"
    | "delete"
    | "claim_email_sent"
    | "claim_email_verified"
    | "mcp_allowlist_updated"
    | "attestation_created"
    | "attestation_verified"
    | "attestation_revoked"
    | "attestation_expired"
    | "issue_instance"
    | "propagate_suspend"
    | "assurance_attested"
    | "countersign_added";

  agent_id: string;
  timestamp: string;
  actor: string; // admin user or system
  changes: Record<string, { from: unknown; to: unknown }>;
  reason?: string;
  metadata?: Record<string, unknown>;
  action_hash: string; // sha256 of canonicalized action (no sig)
  prev_hash?: string; // previous action_hash for this agent
  registry_sig?: string; // base64:ed25519(prev_hash || action_hash)

  // Attestation-specific fields
  attestation_id?: string; // For attestation-related actions
  evidence_type?: string; // Type of evidence being attested
  assurance_level?: string; // Assurance level of the attestation
}

export interface AuditTrail {
  agent_id: string;
  actions: AuditAction[];
  created_at: string;
  updated_at: string;
  last_action_hash?: string; // for hash chaining
}

/**
 * Compute diffs between old and new passport data
 */
export function computePassportDiffs(
  oldData: PassportData | null,
  newData: PassportData
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  if (!oldData) {
    // Create operation - all fields are new
    Object.entries(newData).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        changes[key] = { from: null, to: value };
      }
    });
    return changes;
  }

  // Update operation - only track changed fields
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

  for (const key of allKeys) {
    const oldValue = oldData[key as keyof PassportData];
    const newValue = newData[key as keyof PassportData];

    // Deep comparison for objects/arrays
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes[key] = { from: oldValue, to: newValue };
    }
  }

  return changes;
}

/**
 * Canonicalize audit action for hashing (removes signature fields)
 */
export function canonicalizeAuditAction(
  action: Omit<AuditAction, "action_hash" | "prev_hash" | "registry_sig">
): string {
  const canonical = {
    id: action.id,
    type: action.type,
    agent_id: action.agent_id,
    timestamp: action.timestamp,
    actor: action.actor,
    changes: action.changes,
    reason: action.reason || null, // Normalize undefined to null
    metadata: action.metadata || null, // Normalize undefined to null
    // Include attestation-specific fields
    attestation_id: action.attestation_id || null,
    evidence_type: action.evidence_type || null,
    assurance_level: action.assurance_level || null,
  };

  // Use a more robust canonicalization with sorted keys
  return JSON.stringify(canonical, Object.keys(canonical).sort());
}

/**
 * Generate SHA256 hash of canonicalized action
 */
export async function generateActionHash(
  action: Omit<AuditAction, "action_hash" | "prev_hash" | "registry_sig">
): Promise<string> {
  const canonical = canonicalizeAuditAction(action);
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return btoa(String.fromCharCode(...hashArray));
}

/**
 * Sign audit action with registry private key
 */
export async function signAuditAction(
  action: AuditAction,
  registryPrivateKey: string
): Promise<string> {
  try {
    // Create deterministic signature based on action hash and previous hash
    const signData = action.prev_hash
      ? `${action.prev_hash}:${action.action_hash}`
      : action.action_hash;
    const encoder = new TextEncoder();
    const data = encoder.encode(signData);

    // Use HMAC with registry private key for deterministic signing
    const keyData = encoder.encode(registryPrivateKey);
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", key, data);
    const signatureArray = Array.from(new Uint8Array(signature));
    return btoa(String.fromCharCode(...signatureArray));
  } catch (error) {
    console.error("Error signing audit action:", error);
    throw new Error("Failed to sign audit action");
  }
}

/**
 * Create a complete audit action with hash-chain
 */
export async function createAuditAction(
  type: AuditAction["type"],
  agentId: string,
  actor: string,
  changes: Record<string, { from: unknown; to: unknown }>,
  reason?: string,
  metadata?: Record<string, unknown>,
  registryPrivateKey?: string
): Promise<Omit<AuditAction, "action_hash" | "prev_hash" | "registry_sig">> {
  const action: Omit<
    AuditAction,
    "action_hash" | "prev_hash" | "registry_sig"
  > = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    agent_id: agentId,
    timestamp: new Date().toISOString(),
    actor,
    changes,
    reason,
    metadata,
  };

  return action;
}

/**
 * Complete audit action with hash-chain and signature
 */
export async function completeAuditAction(
  action: Omit<AuditAction, "action_hash" | "prev_hash" | "registry_sig">,
  prevHash: string | null,
  registryPrivateKey?: string
): Promise<AuditAction> {
  // Generate action hash
  const action_hash = await generateActionHash(action);

  // Get previous hash for chaining
  const prev_hash = prevHash || undefined;

  // Sign the action
  let registry_sig: string | undefined;
  if (registryPrivateKey) {
    registry_sig = await signAuditAction(
      { ...action, action_hash, prev_hash, registry_sig: undefined },
      registryPrivateKey
    );
  }

  return {
    ...action,
    action_hash,
    prev_hash,
    registry_sig,
  };
}

/**
 * Store audit action in KV
 */
export async function storeAuditAction(
  kv: KVNamespace,
  action: AuditAction
): Promise<void> {
  const auditKey = `audit:${action.agent_id}`;

  // Get existing Verifiable Attestation
  const existingTrail = (await kv.get(auditKey, "json")) as AuditTrail | null;

  const trail: AuditTrail = existingTrail || {
    agent_id: action.agent_id,
    actions: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Add new action
  trail.actions.push(action);
  trail.updated_at = new Date().toISOString();
  trail.last_action_hash = action.action_hash;

  // Store updated trail
  await kv.put(auditKey, JSON.stringify(trail));
}

/**
 * Get Verifiable Attestation for an agent
 */
export async function getAuditTrail(
  kv: KVNamespace,
  agentId: string
): Promise<AuditTrail | null> {
  const auditKey = `audit:${agentId}`;
  return (await kv.get(auditKey, "json")) as AuditTrail | null;
}

/**
 * Get Verifiable Attestation for all agents owned by an organization
 */
export async function getOrgAuditTrails(
  kv: KVNamespace,
  ownerId: string
): Promise<Record<string, AuditTrail>> {
  try {
    // Get owner's agents from index
    const indexKey = `owner_agents:${ownerId}`;
    const agentIds = ((await kv.get(indexKey, "json")) as string[]) || [];

    const auditTrails: Record<string, AuditTrail> = {};

    // Fetch Verifiable Attestation for each agent
    for (const agentId of agentIds) {
      const trail = await getAuditTrail(kv, agentId);
      if (trail) {
        auditTrails[agentId] = trail;
      }
    }

    return auditTrails;
  } catch (error) {
    console.error(
      `Error getting org Verifiable Attestation for ${ownerId}:`,
      error
    );
    return {};
  }
}

/**
 * Get the last action hash for an agent (for hash chaining)
 */
export async function getLastActionHash(
  kv: KVNamespace,
  agentId: string
): Promise<string | null> {
  const trail = await getAuditTrail(kv, agentId);
  return trail?.last_action_hash || null;
}

/**
 * Verify Verifiable Attestation integrity and signatures
 */
export async function verifyAuditTrail(
  trail: AuditTrail,
  registryPrivateKey: string
): Promise<{
  valid: boolean;
  errors: string[];
  verified_actions: number;
}> {
  const errors: string[] = [];
  let verified_actions = 0;

  // Verify last_action_hash matches the last action
  if (trail.actions.length > 0) {
    const lastAction = trail.actions[trail.actions.length - 1];
    if (trail.last_action_hash !== lastAction.action_hash) {
      errors.push(`last_action_hash does not match last action's hash`);
    }
  } else if (trail.last_action_hash !== undefined) {
    errors.push(`last_action_hash should be undefined for empty trail`);
  }

  for (let i = 0; i < trail.actions.length; i++) {
    const action = trail.actions[i];

    // Verify hash chain
    if (i === 0) {
      // First action should not have prev_hash
      if (action.prev_hash !== undefined) {
        errors.push(`First action should not have prev_hash: ${action.id}`);
        continue;
      }
    } else {
      // Subsequent actions should have prev_hash matching previous action
      const previousAction = trail.actions[i - 1];
      if (action.prev_hash !== previousAction.action_hash) {
        errors.push(
          `Hash chain broken at action ${action.id}: expected ${previousAction.action_hash}, got ${action.prev_hash}`
        );
        continue;
      }
    }

    // Verify action hash
    const expectedHash = await generateActionHash({
      id: action.id,
      type: action.type,
      agent_id: action.agent_id,
      timestamp: action.timestamp,
      actor: action.actor,
      changes: action.changes,
      reason: action.reason,
      metadata: action.metadata,
      attestation_id: action.attestation_id,
      evidence_type: action.evidence_type,
      assurance_level: action.assurance_level,
    });

    if (action.action_hash !== expectedHash) {
      errors.push(
        `Invalid action hash for ${action.id}: expected ${expectedHash}, got ${action.action_hash}`
      );
      continue;
    }

    // Verify signature if present
    if (action.registry_sig) {
      const signatureValid = await verifyAuditActionSignature(
        action,
        registryPrivateKey
      );
      if (!signatureValid) {
        errors.push(`Invalid signature for action ${action.id}`);
        continue;
      }
    }

    verified_actions++;
  }

  return {
    valid: errors.length === 0,
    errors,
    verified_actions,
  };
}

/**
 * Verify audit action signature with registry private key (HMAC verification)
 */
export async function verifyAuditActionSignature(
  action: AuditAction,
  registryPrivateKey: string
): Promise<boolean> {
  try {
    if (!action.registry_sig) {
      return false;
    }

    // Recreate the signature using the same logic as signing
    const signData = action.prev_hash
      ? `${action.prev_hash}:${action.action_hash}`
      : action.action_hash;

    // Generate the expected signature using the same HMAC process as signing
    const expectedSignature = await signAuditAction(action, registryPrivateKey);

    // Compare signatures directly (HMAC is deterministic with same key and data)
    return action.registry_sig === expectedSignature;
  } catch (error) {
    console.error("Error verifying audit action signature:", error);
    return false;
  }
}
