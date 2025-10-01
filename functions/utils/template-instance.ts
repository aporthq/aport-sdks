/**
 * Template and Instance Passport Management Utilities
 * Handles the new template/instance model with additive fields
 */

import { PassportData } from "../../types/passport";
import { KVNamespace } from "@cloudflare/workers-types";
import {
  sendWebhook,
  createInstanceSuspendedPayload,
  WebhookConfig,
} from "./webhook";
import {
  createAuditAction,
  completeAuditAction,
  storeAuditAction,
  getLastActionHash,
  computePassportDiffs,
} from "./audit-trail";

/**
 * Generate template ID with proper prefix
 */
export function generateTemplateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `agt_tmpl_${timestamp}_${random}`;
}

/**
 * Generate instance ID with proper prefix
 */
export function generateInstanceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `agt_inst_${timestamp}_${random}`;
}

/**
 * Check if a string is a valid UUID (any version)
 */
const isUUID = (value: string): boolean => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
};

/**
 * Check if an agent ID is a template
 */
export function isTemplateId(agentId: string): boolean {
  return agentId.startsWith("agt_tmpl_") || isUUID(agentId);
}

/**
 * Check if an agent ID is an instance
 */
export function isInstanceId(agentId: string): boolean {
  return agentId.startsWith("agt_inst_") || isUUID(agentId);
}

/**
 * Create index keys for instance lookups
 */
export async function createInstanceIndexes(
  kv: KVNamespace,
  instanceId: string,
  templateId: string,
  platformId?: string,
  tenantRef?: string,
  controllerId?: string
): Promise<void> {
  const operations: Promise<any>[] = [];

  // Index: instances of a template
  operations.push(kv.put(`idx:parent:${templateId}:${instanceId}`, "1"));

  // Index: instance by platform + tenant
  if (platformId && tenantRef) {
    operations.push(
      kv.put(`idx:tenant:${platformId}:${tenantRef}`, instanceId)
    );
  }

  // Index: instances controlled by org/user
  if (controllerId) {
    operations.push(
      kv.put(`idx:controller:${controllerId}:${instanceId}`, "1")
    );
  }

  await Promise.all(operations);
}

/**
 * Remove index keys when instance is deleted
 */
export async function removeInstanceIndexes(
  kv: KVNamespace,
  instanceId: string,
  templateId: string,
  platformId?: string,
  tenantRef?: string,
  controllerId?: string
): Promise<void> {
  const operations: Promise<any>[] = [];

  // Remove parent index
  operations.push(kv.delete(`idx:parent:${templateId}:${instanceId}`));

  // Remove tenant index
  if (platformId && tenantRef) {
    operations.push(kv.delete(`idx:tenant:${platformId}:${tenantRef}`));
  }

  // Remove controller index
  if (controllerId) {
    operations.push(kv.delete(`idx:controller:${controllerId}:${instanceId}`));
  }

  await Promise.all(operations);
}

/**
 * List all instances of a template
 */
export async function listTemplateInstances(
  kv: KVNamespace,
  templateId: string,
  cursor?: string
): Promise<{ instanceIds: string[]; nextCursor?: string }> {
  const { keys, list_complete } = await kv.list({
    prefix: `idx:parent:${templateId}:`,
    cursor,
  });

  const instanceIds = keys.map((key) =>
    key.name.replace(`idx:parent:${templateId}:`, "")
  );

  return {
    instanceIds,
    nextCursor: list_complete ? undefined : undefined, // TODO: Fix cursor handling
  };
}

/**
 * Find instance by platform and tenant
 */
export async function findInstanceByTenant(
  kv: KVNamespace,
  platformId: string,
  tenantRef: string
): Promise<string | null> {
  const instanceId = await kv.get(`idx:tenant:${platformId}:${tenantRef}`);
  return instanceId as string | null;
}

/**
 * List instances controlled by an org/user
 */
export async function listControllerInstances(
  kv: KVNamespace,
  controllerId: string,
  cursor?: string
): Promise<{ instanceIds: string[]; nextCursor?: string }> {
  const { keys, list_complete } = await kv.list({
    prefix: `idx:controller:${controllerId}:`,
    cursor,
  });

  const instanceIds = keys.map((key) =>
    key.name.replace(`idx:controller:${controllerId}:`, "")
  );

  return {
    instanceIds,
    nextCursor: list_complete ? undefined : undefined, // TODO: Fix cursor handling
  };
}

/**
 * Create an instance passport from a template
 * Inherits all fields except status, assurance_level, limits, and regions which are tenant-specific
 */
export function createInstanceFromTemplate(
  template: PassportData,
  overrides: Partial<PassportData> = {}
): PassportData {
  // Copy all fields from template
  const instance: PassportData = {
    ...template,
    // Override with provided values
    ...overrides,
    // Ensure instance-specific fields are set
    kind: "instance",
    parent_agent_id: template.agent_id,
    // Owner is the controller (tenant) for instances, not the template creator
    owner_id: overrides.controller_id || template.owner_id,
    owner_display: overrides.owner_display || template.owner_display,
    owner_type:
      overrides.controller_type === "org" ||
      overrides.controller_type === "user"
        ? overrides.controller_type
        : template.owner_type,
    // Tenant-specific fields (these should be overridden)
    status: overrides.status || "draft",
    assurance_level: overrides.assurance_level || template.assurance_level,
    limits: overrides.limits || template.limits,
    regions: overrides.regions || template.regions,
  };

  return instance;
}

/**
 * Suspend all instances of a template
 */
export async function suspendTemplateInstances(
  kv: KVNamespace,
  templateId: string,
  webhookConfig?: WebhookConfig,
  registryPrivateKey?: string,
  actor?: string
): Promise<{ suspended: number; errors: string[] }> {
  const { instanceIds } = await listTemplateInstances(kv, templateId);
  const errors: string[] = [];
  let suspended = 0;

  for (const instanceId of instanceIds) {
    try {
      const key = `passport:${instanceId}`;
      const passport = (await kv.get(key, "json")) as PassportData | null;

      if (
        passport &&
        passport.status !== "suspended" &&
        passport.status !== "revoked"
      ) {
        const previousStatus = passport.status;
        const updatedPassport: PassportData = {
          ...passport,
          status: "suspended",
          updated_at: new Date().toISOString(),
        };

        await kv.put(key, JSON.stringify(updatedPassport));
        suspended++;

        // Create audit action for propagate_suspend
        if (registryPrivateKey && actor) {
          try {
            const changes = computePassportDiffs(passport, updatedPassport);
            const auditAction = await createAuditAction(
              "propagate_suspend",
              instanceId,
              actor,
              changes,
              `Instance suspended due to template ${templateId} suspension`,
              {
                template_id: templateId,
                previous_status: previousStatus,
                new_status: "suspended",
                propagation_reason: "template_suspended",
              }
            );

            const prevHash = await getLastActionHash(kv, instanceId);
            const completedAuditAction = await completeAuditAction(
              auditAction,
              prevHash,
              registryPrivateKey
            );

            await storeAuditAction(kv, completedAuditAction);
          } catch (auditError) {
            console.warn(
              `Failed to create audit action for instance ${instanceId}:`,
              auditError
            );
          }
        }

        // Send webhook notification for instance suspension
        if (webhookConfig?.url && passport.kind === "instance") {
          const webhookPayload = createInstanceSuspendedPayload(
            instanceId,
            templateId,
            passport.platform_id || "",
            passport.tenant_ref || "",
            passport.controller_id || "",
            passport.controller_type || "user",
            updatedPassport.updated_at
          );

          // Send webhook asynchronously (don't block)
          sendWebhook(webhookConfig, webhookPayload).catch((error) => {
            console.warn(`Webhook failed for instance ${instanceId}:`, error);
          });
        }
      }
    } catch (error) {
      errors.push(`Failed to suspend instance ${instanceId}: ${error}`);
    }
  }

  return { suspended, errors };
}

/**
 * Revoke all instances of a template
 */
export async function revokeTemplateInstances(
  kv: KVNamespace,
  templateId: string
): Promise<{ revoked: number; errors: string[] }> {
  const { instanceIds } = await listTemplateInstances(kv, templateId);
  const errors: string[] = [];
  let revoked = 0;

  for (const instanceId of instanceIds) {
    try {
      const key = `passport:${instanceId}`;
      const passport = (await kv.get(key, "json")) as PassportData | null;

      if (passport && passport.status !== "revoked") {
        const updatedPassport: PassportData = {
          ...passport,
          status: "revoked",
          updated_at: new Date().toISOString(),
        };

        await kv.put(key, JSON.stringify(updatedPassport));
        revoked++;
      }
    } catch (error) {
      errors.push(`Failed to revoke instance ${instanceId}: ${error}`);
    }
  }

  return { revoked, errors };
}

/**
 * Propagate template changes to instances
 * Updates capabilities and description, marks instances with updated_from_parent_at
 */
export async function propagateTemplateChanges(
  kv: KVNamespace,
  templateId: string,
  templateChanges: {
    capabilities?: any[];
    description?: string;
    // Add other fields that should propagate
    role?: string;
    name?: string;
    logo_url?: string;
    categories?: any[];
    framework?: any[];
    mcp?: any;
    attestations?: any[];
  }
): Promise<{ updated: number; errors: string[] }> {
  const { instanceIds } = await listTemplateInstances(kv, templateId);
  const errors: string[] = [];
  let updated = 0;

  for (const instanceId of instanceIds) {
    try {
      const key = `passport:${instanceId}`;
      const passport = (await kv.get(key, "json")) as PassportData | null;

      if (passport && passport.kind === "instance") {
        const updatedPassport: PassportData = {
          ...passport,
          // Propagate template changes (only non-tenant-specific fields)
          capabilities: templateChanges.capabilities || passport.capabilities,
          description: templateChanges.description || passport.description,
          role: templateChanges.role || passport.role,
          name: templateChanges.name || passport.name,
          logo_url: templateChanges.logo_url || passport.logo_url,
          categories: templateChanges.categories || passport.categories,
          framework: templateChanges.framework || passport.framework,
          mcp: templateChanges.mcp || passport.mcp,
          attestations: templateChanges.attestations || passport.attestations,
          // Mark as updated from parent
          updated_at: new Date().toISOString(),
          updated_from_parent_at: new Date().toISOString(),
        };

        await kv.put(key, JSON.stringify(updatedPassport));
        updated++;
      }
    } catch (error) {
      errors.push(`Failed to update instance ${instanceId}: ${error}`);
    }
  }

  return { updated, errors };
}

/**
 * Handle template status change propagation
 * If template becomes "revoked", suspend all instances
 */
export async function handleTemplateStatusChange(
  kv: KVNamespace,
  templateId: string,
  newStatus: string,
  webhookConfig?: WebhookConfig,
  registryPrivateKey?: string,
  actor?: string
): Promise<{ suspended: number; errors: string[] }> {
  if (newStatus === "revoked") {
    return await suspendTemplateInstances(
      kv,
      templateId,
      webhookConfig,
      registryPrivateKey,
      actor
    );
  }

  return { suspended: 0, errors: [] };
}
