/**
 * D1 Repository Implementations
 *
 * This module implements all repository interfaces using D1 database with Drizzle ORM.
 * All operations are scoped to tenants (org_id) for multi-tenant isolation.
 */

import { eq, and, desc, asc, sql, count, lt, gte } from "drizzle-orm";
import { D1Database } from "@cloudflare/workers-types";
import * as schema from "../../schema/drizzle.schema";
import {
  PassportRepo,
  DecisionLogRepo,
  PolicyRepo,
  OrgRepo,
  RefundRepo,
  IdempotencyRepo,
  PassportRow,
  PassportSummary,
  DecisionEventRow,
  PolicyRow,
  OrgRow,
  TenantRow,
  RefundCounterRow,
  IdempotencyRow,
  ConcurrencyError,
} from "../ports";
import {
  mapToPassportRow,
  mapToDbPassport,
  mapToOrgRow,
  mapToTenantRow,
  mapToPolicyRow,
  mapToDecisionEventRow,
  mapToIdempotencyRow,
  validatePassportFields,
  validateOrgFields,
  withErrorHandling,
  createCounterId,
  generateDecisionId,
  generateCounterId,
} from "./utils";

// ============================================================================
// D1 Passport Repository
// ============================================================================

export class D1PassportRepo implements PassportRepo {
  constructor(
    private db: ReturnType<typeof import("drizzle-orm/d1").drizzle>,
    private orgId: string
  ) {}

  async getById(
    orgId: string,
    passportId: string
  ): Promise<PassportRow | null> {
    return withErrorHandling(async () => {
      const result = await this.db
        .select()
        .from(schema.passports)
        .where(
          and(
            eq(schema.passports.agent_id, passportId),
            eq(schema.passports.owner_id, orgId)
          )
        )
        .limit(1);

      return result[0] ? mapToPassportRow(result[0]) : null;
    }, "PassportRepo.getById");
  }

  async getBySlug(orgId: string, slug: string): Promise<PassportRow | null> {
    return withErrorHandling(async () => {
      const result = await this.db
        .select()
        .from(schema.passports)
        .where(
          and(
            eq(schema.passports.slug, slug),
            eq(schema.passports.owner_id, orgId)
          )
        )
        .limit(1);

      return result[0] ? mapToPassportRow(result[0]) : null;
    }, "PassportRepo.getBySlug");
  }

  async create(passport: PassportRow): Promise<void> {
    // Validate required fields
    const errors = validatePassportFields(passport);
    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join(", ")}`);
    }

    return withErrorHandling(async () => {
      const dbPassport = mapToDbPassport(passport);
      await this.db.insert(schema.passports).values(dbPassport);
    }, "PassportRepo.create");
  }

  async update(
    passport: PassportRow,
    opts?: { expectedVersion?: number }
  ): Promise<void> {
    return withErrorHandling(async () => {
      const { expectedVersion } = opts || {};

      if (expectedVersion !== undefined) {
        // Check current version for optimistic concurrency
        const current = await this.getById(this.orgId, passport.agent_id);
        if (!current) {
          throw new Error("Passport not found");
        }

        if (current.version_number !== expectedVersion) {
          throw new ConcurrencyError(
            "Passport was modified by another request",
            expectedVersion,
            current.version_number
          );
        }
      }

      const dbPassport = mapToDbPassport(passport);
      await this.db
        .update(schema.passports)
        .set(dbPassport)
        .where(eq(schema.passports.agent_id, passport.agent_id));
    }, "PassportRepo.update");
  }

  async listByOrg(
    orgId: string,
    kind?: "template" | "instance"
  ): Promise<PassportSummary[]> {
    return withErrorHandling(async () => {
      const whereConditions = kind
        ? and(
            eq(schema.passports.owner_id, orgId),
            eq(schema.passports.kind, kind)
          )
        : eq(schema.passports.owner_id, orgId);

      const results = await this.db
        .select({
          agent_id: schema.passports.agent_id,
          slug: schema.passports.slug,
          name: schema.passports.name,
          owner_id: schema.passports.owner_id,
          owner_type: schema.passports.owner_type,
          status: schema.passports.status,
          role: schema.passports.role,
          description: schema.passports.description,
          created_at: schema.passports.created_at,
          updated_at: schema.passports.updated_at,
          kind: schema.passports.kind,
        })
        .from(schema.passports)
        .where(whereConditions)
        .orderBy(desc(schema.passports.updated_at));

      return results.map(this.mapToPassportSummary);
    }, "PassportRepo.listByOrg");
  }

  async listInstancesByTemplate(
    orgId: string,
    templateId: string
  ): Promise<PassportSummary[]> {
    const results = await this.db
      .select({
        agent_id: schema.passports.agent_id,
        slug: schema.passports.slug,
        name: schema.passports.name,
        owner_id: schema.passports.owner_id,
        owner_type: schema.passports.owner_type,
        status: schema.passports.status,
        role: schema.passports.role,
        description: schema.passports.description,
        created_at: schema.passports.created_at,
        updated_at: schema.passports.updated_at,
        kind: schema.passports.kind,
      })
      .from(schema.passports)
      .where(
        and(
          eq(schema.passports.owner_id, orgId),
          eq(schema.passports.parent_agent_id, templateId),
          eq(schema.passports.kind, "instance")
        )
      )
      .orderBy(desc(schema.passports.created_at));

    return results.map(this.mapToPassportSummary);
  }

  async findInstanceByTenant(
    orgId: string,
    platformId: string,
    tenantRef: string
  ): Promise<PassportRow | null> {
    return withErrorHandling(async () => {
      const result = await this.db
        .select()
        .from(schema.passports)
        .where(
          and(
            eq(schema.passports.owner_id, orgId),
            eq(schema.passports.platform_id, platformId),
            eq(schema.passports.tenant_ref, tenantRef),
            eq(schema.passports.kind, "instance")
          )
        )
        .limit(1);

      return result[0] ? mapToPassportRow(result[0]) : null;
    }, "PassportRepo.findInstanceByTenant");
  }

  async isSlugUnique(
    orgId: string,
    slug: string,
    excludeId?: string
  ): Promise<boolean> {
    const whereConditions = excludeId
      ? and(
          eq(schema.passports.owner_id, orgId),
          eq(schema.passports.slug, slug),
          sql`${schema.passports.agent_id} != ${excludeId}`
        )
      : and(
          eq(schema.passports.owner_id, orgId),
          eq(schema.passports.slug, slug)
        );

    const result = await this.db
      .select({ count: count() })
      .from(schema.passports)
      .where(whereConditions);

    return result[0].count === 0;
  }

  async isNameUnique(
    orgId: string,
    name: string,
    excludeId?: string
  ): Promise<boolean> {
    const whereConditions = excludeId
      ? and(
          eq(schema.passports.owner_id, orgId),
          eq(schema.passports.name, name),
          sql`${schema.passports.agent_id} != ${excludeId}`
        )
      : and(
          eq(schema.passports.owner_id, orgId),
          eq(schema.passports.name, name)
        );

    const result = await this.db
      .select({ count: count() })
      .from(schema.passports)
      .where(whereConditions);

    return result[0].count === 0;
  }

  async getCountByOrg(orgId: string): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(schema.passports)
      .where(eq(schema.passports.owner_id, orgId));

    return result[0].count;
  }

  private mapToPassportSummary(dbPassport: any): PassportSummary {
    return {
      agent_id: dbPassport.agent_id,
      slug: dbPassport.slug,
      name: dbPassport.name,
      owner_id: dbPassport.owner_id,
      owner_type: dbPassport.owner_type,
      status: dbPassport.status,
      role: dbPassport.role,
      description: dbPassport.description,
      created_at: dbPassport.created_at,
      updated_at: dbPassport.updated_at,
      kind: dbPassport.kind,
    };
  }
}

// ============================================================================
// D1 Decision Log Repository
// ============================================================================

export class D1DecisionLogRepo implements DecisionLogRepo {
  constructor(
    private db: ReturnType<typeof import("drizzle-orm/d1").drizzle>,
    private orgId: string
  ) {}

  async append(event: DecisionEventRow): Promise<void> {
    return withErrorHandling(async () => {
      const dbEvent = {
        ...event,
        context: JSON.stringify(event.context),
      };
      await this.db.insert(schema.decision_events).values(dbEvent);
    }, "DecisionLogRepo.append");
  }

  async getByAgent(
    orgId: string,
    agentId: string,
    limit: number = 100
  ): Promise<DecisionEventRow[]> {
    const results = await this.db
      .select()
      .from(schema.decision_events)
      .where(
        and(
          eq(schema.decision_events.org_id, orgId),
          eq(schema.decision_events.agent_id, agentId)
        )
      )
      .orderBy(desc(schema.decision_events.created_at))
      .limit(limit);

    return results.map(mapToDecisionEventRow);
  }

  async getByPolicyPack(
    orgId: string,
    packId: string,
    limit: number = 100
  ): Promise<DecisionEventRow[]> {
    const results = await this.db
      .select()
      .from(schema.decision_events)
      .where(
        and(
          eq(schema.decision_events.org_id, orgId),
          eq(schema.decision_events.policy_pack_id, packId)
        )
      )
      .orderBy(desc(schema.decision_events.created_at))
      .limit(limit);

    return results.map(mapToDecisionEventRow);
  }

  async getLatestByAgent(
    orgId: string,
    agentId: string
  ): Promise<DecisionEventRow | null> {
    const result = await this.db
      .select()
      .from(schema.decision_events)
      .where(
        and(
          eq(schema.decision_events.org_id, orgId),
          eq(schema.decision_events.agent_id, agentId)
        )
      )
      .orderBy(desc(schema.decision_events.created_at))
      .limit(1);

    return result[0] ? mapToDecisionEventRow(result[0]) : null;
  }
}

// ============================================================================
// D1 Policy Repository
// ============================================================================

export class D1PolicyRepo implements PolicyRepo {
  constructor(
    private db: ReturnType<typeof import("drizzle-orm/d1").drizzle>,
    private orgId: string
  ) {}

  async getActiveByPack(
    orgId: string,
    packId: string
  ): Promise<PolicyRow | null> {
    const result = await this.db
      .select()
      .from(schema.policies)
      .where(
        and(
          eq(schema.policies.org_id, orgId),
          eq(schema.policies.pack_id, packId),
          eq(schema.policies.is_active, true)
        )
      )
      .limit(1);

    return result[0] ? mapToPolicyRow(result[0]) : null;
  }

  async listByOrg(orgId: string): Promise<PolicyRow[]> {
    const results = await this.db
      .select()
      .from(schema.policies)
      .where(eq(schema.policies.org_id, orgId))
      .orderBy(desc(schema.policies.updated_at));

    return results.map(mapToPolicyRow);
  }

  async upsert(policy: PolicyRow): Promise<void> {
    const dbPolicy = {
      ...policy,
      rules: JSON.stringify(policy.rules),
    };

    await this.db
      .insert(schema.policies)
      .values(dbPolicy)
      .onConflictDoUpdate({
        target: schema.policies.policy_id,
        set: {
          name: dbPolicy.name,
          description: dbPolicy.description,
          rules: dbPolicy.rules,
          is_active: dbPolicy.is_active,
          updated_at: dbPolicy.updated_at,
          version: dbPolicy.version,
        },
      });
  }

  async deactivate(orgId: string, policyId: string): Promise<void> {
    await this.db
      .update(schema.policies)
      .set({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .where(
        and(
          eq(schema.policies.org_id, orgId),
          eq(schema.policies.policy_id, policyId)
        )
      );
  }

  private mapToPolicyRow(dbPolicy: any): PolicyRow {
    return {
      ...dbPolicy,
      rules: JSON.parse(dbPolicy.rules),
    };
  }
}

// ============================================================================
// D1 Organization Repository
// ============================================================================

export class D1OrgRepo implements OrgRepo {
  constructor(
    private db: ReturnType<typeof import("drizzle-orm/d1").drizzle>
  ) {}

  async getById(orgId: string): Promise<OrgRow | null> {
    const result = await this.db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.org_id, orgId))
      .limit(1);

    return result[0] ? mapToOrgRow(result[0]) : null;
  }

  async getTenant(orgId: string): Promise<TenantRow | null> {
    const result = await this.db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.tenant_id, orgId))
      .limit(1);

    return result[0] ? mapToTenantRow(result[0]) : null;
  }

  async create(org: OrgRow): Promise<void> {
    // Validate required fields
    const errors = validateOrgFields(org);
    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join(", ")}`);
    }

    return withErrorHandling(async () => {
      const dbOrg = {
        ...org,
        domain: org.domain || null,
        assurance_method: org.assurance_method || null,
        assurance_verified_at: org.assurance_verified_at || null,
        org_key_id: org.org_key_id || null,
        org_key_hash: org.org_key_hash || null,
        db_connection_string: org.db_connection_string || null,
      };

      await this.db.insert(schema.organizations).values(dbOrg);

      // Also create tenant record
      const tenant = {
        tenant_id: org.org_id,
        org_id: org.org_id,
        region: org.region,
        db_kind: org.db_kind,
        db_connection_string: org.db_connection_string || null,
        created_at: org.created_at,
        updated_at: org.updated_at,
      };

      await this.db.insert(schema.tenants).values(tenant);
    }, "OrgRepo.create");
  }

  async update(org: OrgRow): Promise<void> {
    await this.db
      .update(schema.organizations)
      .set(org)
      .where(eq(schema.organizations.org_id, org.org_id));

    // Also update tenant record
    await this.db
      .update(schema.tenants)
      .set({
        region: org.region,
        db_kind: org.db_kind,
        db_connection_string: org.db_connection_string,
        updated_at: org.updated_at,
      })
      .where(eq(schema.tenants.tenant_id, org.org_id));
  }

  async listAll(): Promise<OrgRow[]> {
    const results = await this.db
      .select()
      .from(schema.organizations)
      .orderBy(desc(schema.organizations.created_at));

    return results.map((org) => ({
      ...org,
      domain: org.domain || undefined,
      assurance_level: org.assurance_level as any, // Cast to AssuranceLevel
      assurance_method: (org.assurance_method as any) || undefined, // Cast to AssuranceMethod
      assurance_verified_at: org.assurance_verified_at || undefined,
      org_key_id: org.org_key_id || undefined,
      org_key_hash: org.org_key_hash || undefined,
      db_connection_string: org.db_connection_string || undefined,
      members: [], // TODO: Load members from separate table if needed
    }));
  }

  async exists(orgId: string): Promise<boolean> {
    const result = await this.db
      .select({ count: count() })
      .from(schema.organizations)
      .where(eq(schema.organizations.org_id, orgId));

    return result[0].count > 0;
  }
}

// ============================================================================
// D1 Refund Repository
// ============================================================================

export class D1RefundRepo implements RefundRepo {
  constructor(
    private db: ReturnType<typeof import("drizzle-orm/d1").drizzle>,
    private orgId: string
  ) {}

  async tryConsume(
    orgId: string,
    agentId: string,
    currency: string,
    amountMinor: number
  ): Promise<{ success: boolean; remaining: number }> {
    return withErrorHandling(async () => {
      const counterId = createCounterId(orgId, agentId, currency);

      // Try to get existing counter
      const existing = await this.db
        .select()
        .from(schema.refund_counters)
        .where(eq(schema.refund_counters.counter_id, counterId))
        .limit(1);

      if (existing[0]) {
        // Update existing counter
        const newAmount = existing[0].amount_minor + amountMinor;
        await this.db
          .update(schema.refund_counters)
          .set({
            amount_minor: newAmount,
            updated_at: new Date().toISOString(),
          })
          .where(eq(schema.refund_counters.counter_id, counterId));

        return { success: true, remaining: newAmount };
      } else {
        // Create new counter
        await this.db.insert(schema.refund_counters).values({
          counter_id: counterId,
          org_id: orgId,
          agent_id: agentId,
          currency,
          date_utc: new Date().toISOString().split("T")[0],
          amount_minor: amountMinor,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        return { success: true, remaining: amountMinor };
      }
    }, "RefundRepo.tryConsume");
  }

  async getBalance(
    orgId: string,
    agentId: string,
    currency: string,
    dateUtc: string
  ): Promise<number> {
    const counterId = `${orgId}:${agentId}:${currency}:${dateUtc}`;

    const result = await this.db
      .select()
      .from(schema.refund_counters)
      .where(eq(schema.refund_counters.counter_id, counterId))
      .limit(1);

    return result[0]?.amount_minor || 0;
  }

  async resetCounter(
    orgId: string,
    agentId: string,
    currency: string,
    dateUtc: string
  ): Promise<void> {
    const counterId = `${orgId}:${agentId}:${currency}:${dateUtc}`;

    await this.db
      .update(schema.refund_counters)
      .set({
        amount_minor: 0,
        updated_at: new Date().toISOString(),
      })
      .where(eq(schema.refund_counters.counter_id, counterId));
  }
}

// ============================================================================
// D1 Idempotency Repository
// ============================================================================

export class D1IdempotencyRepo implements IdempotencyRepo {
  constructor(
    private db: ReturnType<typeof import("drizzle-orm/d1").drizzle>,
    private orgId: string
  ) {}

  async checkAndStore(
    key: string,
    orgId: string,
    agentId: string,
    operationType: string,
    result: any,
    ttlSeconds: number
  ): Promise<{ isIdempotent: boolean; cachedResult?: any }> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    try {
      // Try to insert new record
      await this.db.insert(schema.idempotency_keys).values({
        idempotency_key: key,
        org_id: orgId,
        agent_id: agentId,
        operation_type: operationType,
        result: JSON.stringify(result),
        created_at: new Date().toISOString(),
        expires_at: expiresAt,
      });

      return { isIdempotent: false };
    } catch (error) {
      // Record already exists, return cached result
      const existing = await this.db
        .select()
        .from(schema.idempotency_keys)
        .where(eq(schema.idempotency_keys.idempotency_key, key))
        .limit(1);

      if (existing[0]) {
        return {
          isIdempotent: true,
          cachedResult: JSON.parse(existing[0].result),
        };
      }

      throw error;
    }
  }

  async get(key: string): Promise<IdempotencyRow | null> {
    const result = await this.db
      .select()
      .from(schema.idempotency_keys)
      .where(eq(schema.idempotency_keys.idempotency_key, key))
      .limit(1);

    return result[0] ? mapToIdempotencyRow(result[0]) : null;
  }

  async cleanup(): Promise<number> {
    const now = new Date().toISOString();

    const result = await this.db
      .delete(schema.idempotency_keys)
      .where(lt(schema.idempotency_keys.expires_at, now));

    return (result as any).changes || 0;
  }
}
