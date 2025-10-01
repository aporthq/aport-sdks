/**
 * Tenant Durable Object
 *
 * This Durable Object provides single-writer semantics per tenant, ensuring:
 * - Serialized writes (no write races)
 * - Atomic counters for refunds
 * - Idempotency key management
 * - Audit hash-chain consistency
 * - Optimistic concurrency control
 */

import { DurableObject } from "cloudflare:workers";
import { D1Database, KVNamespace, R2Bucket } from "@cloudflare/workers-types";
import { createTenantDatabaseFactory } from "./database-factory-resolver";
import {
  PassportRow,
  DecisionEventRow,
  ConcurrencyError,
  TransactionError,
  TenantRow,
} from "../adapters/ports";
import {
  ComplianceMetadata,
  ComplianceValidator,
} from "../../types/compliance";
import { resolveTenantBindings } from "./region";
import { createPassportStorageService } from "../utils/passport-storage-service";
// Note: In Cloudflare Workers, use Web Crypto API instead of Node.js crypto
// import { createHash, randomBytes } from "crypto";

// ============================================================================
// Message Types
// ============================================================================

export interface CreatePassportMessage {
  type: "CREATE_PASSPORT";
  payload: PassportRow;
  requestId: string;
}

export interface UpdatePassportMessage {
  type: "UPDATE_PASSPORT";
  payload: PassportRow;
  expectedVersion: number;
  requestId: string;
}

export interface StatusChangeMessage {
  type: "STATUS_CHANGE";
  payload: {
    agentId: string;
    status: "draft" | "active" | "suspended" | "revoked";
    reason?: string;
  };
  requestId: string;
}

export interface RefundConsumeMessage {
  type: "REFUND_CONSUME";
  payload: {
    agentId: string;
    currency: string;
    amountMinor: number;
    idempotencyKey: string;
  };
  requestId: string;
}

export interface AppendDecisionMessage {
  type: "APPEND_DECISION";
  payload: DecisionEventRow;
  requestId: string;
}

export interface GetAuditHashesMessage {
  type: "GET_AUDIT_HASHES";
  payload: {
    limit?: number;
    agentId?: string;
    policyPackId?: string;
    since?: string;
  };
  requestId: string;
}

export interface InitializeTenantMessage {
  type: "INITIALIZE_TENANT";
  payload: TenantRow;
  requestId: string;
}

export type TenantMessage =
  | CreatePassportMessage
  | UpdatePassportMessage
  | StatusChangeMessage
  | RefundConsumeMessage
  | AppendDecisionMessage
  | GetAuditHashesMessage
  | InitializeTenantMessage;

// ============================================================================
// Response Types
// ============================================================================

export interface TenantResponse {
  success: boolean;
  data?: any;
  error?: string;
  requestId: string;
  message?: string;
}

export interface RefundConsumeResponse {
  success: boolean;
  remaining: number;
  consumed: number;
  dailyLimit: number;
  requestId: string;
}

// ============================================================================
// Tenant State
// ============================================================================

interface TenantState {
  // Audit chain state
  lastDecisionHash: string | null;
  lastDecisionId: string | null;

  // Refund counters (in-memory for atomicity)
  refundCounters: Map<string, number>; // key: "agentId:currency:date"

  // Idempotency tracking
  idempotencyKeys: Map<string, { result: any; expiresAt: number }>;

  // Request tracking for debugging
  activeRequests: Set<string>;
}

// ============================================================================
// Tenant Durable Object
// ============================================================================

export class TenantDO extends DurableObject {
  private state: DurableObjectState;
  private tenantId: string;
  private tenantState: TenantState;
  private dbFactory: any;
  private storageService: any;

  constructor(state: DurableObjectState, env: any) {
    // Required, as we're extending the base class
    super(state, env);
    this.state = state;
    this.tenantId = state.id.toString();
    this.tenantState = {
      lastDecisionHash: null,
      lastDecisionId: null,
      refundCounters: new Map(),
      idempotencyKeys: new Map(),
      activeRequests: new Set(),
    };

    // Database factory will be initialized per-request with tenant-specific bindings
    this.dbFactory = null;

    // Initialize storage service with tenant-specific bindings
    this.storageService = createPassportStorageService(
      env.ai_passport_registry,
      {
        r2: env.PASSPORT_SNAPSHOTS_BUCKET,
        region: env.DEFAULT_REGION || "US",
        version: env.AP_VERSION || "1.0.0",
        tenantId: this.tenantId,
      }
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/message" && request.method === "POST") {
        return await this.handleMessage(request);
      } else if (path === "/health" && request.method === "GET") {
        return await this.handleHealthCheck();
      } else if (path === "/state" && request.method === "GET") {
        return await this.handleStateRequest();
      } else {
        return new Response("Not Found", { status: 404 });
      }
    } catch (error) {
      console.error(`TenantDO error for tenant ${this.tenantId}:`, error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  private async handleMessage(request: Request): Promise<Response> {
    const message: TenantMessage = await request.json();

    // Track active request
    this.tenantState.activeRequests.add(message.requestId);

    try {
      let result: any;

      switch (message.type) {
        case "INITIALIZE_TENANT":
          result = await this.handleInitializeTenant(message);
          break;
        case "CREATE_PASSPORT":
          result = await this.handleCreatePassport(message);
          break;
        case "UPDATE_PASSPORT":
          result = await this.handleUpdatePassport(message);
          break;
        case "STATUS_CHANGE":
          result = await this.handleStatusChange(message);
          break;
        case "REFUND_CONSUME":
          result = await this.handleRefundConsume(message);
          break;
        case "APPEND_DECISION":
          result = await this.handleAppendDecision(message);
          break;
        case "GET_AUDIT_HASHES":
          result = await this.handleGetAuditHashes(message);
          break;
        default:
          throw new Error(`Unknown message type: ${(message as any).type}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: result,
          requestId: message.requestId,
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          requestId: message.requestId,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    } finally {
      // Clean up request tracking
      this.tenantState.activeRequests.delete(message.requestId);
    }
  }

  // ============================================================================
  // Tenant Initialization
  // ============================================================================

  private async handleInitializeTenant(
    message: InitializeTenantMessage
  ): Promise<{ success: boolean }> {
    const { payload: tenant } = message;

    // Initialize database factory with tenant-specific region bindings
    await this.initializeDbFactory(tenant);

    return { success: true };
  }

  // ============================================================================
  // Passport Operations
  // ============================================================================

  private async handleCreatePassport(
    message: CreatePassportMessage
  ): Promise<PassportRow> {
    const { payload: passport } = message;

    return await this.withTransaction(async (ctx) => {
      // Check if passport already exists
      const existing = await ctx.passports.getById(
        passport.owner_id,
        passport.agent_id
      );
      if (existing) {
        throw new Error("Passport already exists");
      }

      // Check slug uniqueness
      const isSlugUnique = await ctx.passports.isSlugUnique(
        passport.owner_id,
        passport.slug
      );
      if (!isSlugUnique) {
        throw new Error("Slug already exists");
      }

      // Add compliance metadata if not present
      const passportWithCompliance = {
        ...passport,
        compliance_metadata:
          passport.compliance_metadata ||
          this.generateComplianceMetadata(passport.owner_id),
      };

      // Create passport in D1
      await ctx.passports.create(passportWithCompliance);

      // Log decision event
      await this.appendDecisionEvent(ctx, {
        decision_id: `dec_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`,
        org_id: passport.owner_id,
        agent_id: passport.agent_id,
        policy_pack_id: "passport_creation",
        decision: "allow",
        reason: "Passport created successfully",
        context: JSON.stringify({
          action: "create_passport",
          passport_id: passport.agent_id,
          slug: passport.slug,
          compliance_metadata: passportWithCompliance.compliance_metadata,
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        record_hash: "",
      });

      // Handle all multi-stage storage operations (KV, R2, indexes, caching)
      const storageResult = await this.storageService.createPassport(
        passportWithCompliance,
        {
          createBackup: true,
          invalidateCache: true,
          preWarmCache: true,
          reason: "Passport created via TenantDO",
          actor: "tenantdo",
        }
      );

      if (!storageResult.success) {
        console.error(
          `Storage operations failed for passport ${passport.agent_id}:`,
          storageResult.error
        );
        // Don't throw - D1 transaction is already committed, just log the error
      }

      return passportWithCompliance;
    });
  }

  private async handleUpdatePassport(
    message: UpdatePassportMessage
  ): Promise<PassportRow> {
    const { payload: passport, expectedVersion } = message;

    return await this.withTransaction(async (ctx) => {
      // Get current passport
      const current = await ctx.passports.getById(
        passport.owner_id,
        passport.agent_id
      );
      if (!current) {
        throw new Error("Passport not found");
      }

      // Check version for optimistic concurrency
      if (current.version_number !== expectedVersion) {
        throw new ConcurrencyError(
          "Passport was modified by another request",
          expectedVersion,
          current.version_number
        );
      }

      // Update passport with incremented version
      const updatedPassport = {
        ...passport,
        version_number: current.version_number + 1,
        updated_at: new Date().toISOString(),
      };

      await ctx.passports.update(updatedPassport, { expectedVersion });

      // Log decision event
      await this.appendDecisionEvent(ctx, {
        decision_id: `dec_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`,
        org_id: passport.owner_id,
        agent_id: passport.agent_id,
        policy_pack_id: "passport_update",
        decision: "allow",
        reason: "Passport updated successfully",
        context: JSON.stringify({
          action: "update_passport",
          passport_id: passport.agent_id,
          version: updatedPassport.version_number,
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        record_hash: "",
      });

      // Handle all multi-stage storage operations (KV, R2, indexes, caching)
      const storageResult = await this.storageService.updatePassport(
        updatedPassport,
        current,
        {
          createBackup: true,
          invalidateCache: true,
          preWarmCache: true,
          reason: "Passport updated via TenantDO",
          actor: "tenantdo",
        }
      );

      if (!storageResult.success) {
        console.error(
          `Storage operations failed for passport ${passport.agent_id}:`,
          storageResult.error
        );
        // Don't throw - D1 transaction is already committed, just log the error
      }

      return updatedPassport;
    });
  }

  private async handleStatusChange(
    message: StatusChangeMessage
  ): Promise<{ success: boolean }> {
    const { payload } = message;

    return await this.withTransaction(async (ctx) => {
      // Get current passport
      const current = await ctx.passports.getById(
        this.tenantId,
        payload.agentId
      );
      if (!current) {
        throw new Error("Passport not found");
      }

      // Update status
      const updatedPassport = {
        ...current,
        status: payload.status,
        updated_at: new Date().toISOString(),
        version_number: current.version_number + 1,
      };

      await ctx.passports.update(updatedPassport, {
        expectedVersion: current.version_number,
      });

      // Log decision event
      await this.appendDecisionEvent(ctx, {
        decision_id: `dec_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`,
        org_id: this.tenantId,
        agent_id: payload.agentId,
        policy_pack_id: "status_change",
        decision: "allow",
        reason: `Status changed to ${payload.status}${
          payload.reason ? `: ${payload.reason}` : ""
        }`,
        context: JSON.stringify({
          action: "status_change",
          passport_id: payload.agentId,
          old_status: current.status,
          new_status: payload.status,
          reason: payload.reason,
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        record_hash: "",
      });

      // Handle all multi-stage storage operations (KV, R2, indexes, caching)
      const storageResult = await this.storageService.changeStatus(
        payload.agentId,
        payload.status,
        payload.reason,
        {
          createBackup: true,
          invalidateCache: true,
          preWarmCache: true,
          reason: `Status changed to ${payload.status} via TenantDO`,
          actor: "tenantdo",
        }
      );

      if (!storageResult.success) {
        console.error(
          `Storage operations failed for passport ${payload.agentId}:`,
          storageResult.error
        );
        // Don't throw - D1 transaction is already committed, just log the error
      }

      return { success: true };
    });
  }

  // ============================================================================
  // Refund Operations
  // ============================================================================

  private async handleRefundConsume(
    message: RefundConsumeMessage
  ): Promise<RefundConsumeResponse> {
    const { payload } = message;
    const { agentId, currency, amountMinor, idempotencyKey } = payload;

    // Check idempotency first
    const idempotentResult = await this.checkIdempotency(idempotencyKey);
    if (idempotentResult.isIdempotent) {
      return {
        success: true,
        remaining: idempotentResult.cachedResult.remaining,
        consumed: idempotentResult.cachedResult.consumed,
        dailyLimit: idempotentResult.cachedResult.dailyLimit,
        requestId: message.requestId,
      };
    }

    return await this.withTransaction(async (ctx) => {
      // Get current refund counter
      const counterKey = `${agentId}:${currency}:${
        new Date().toISOString().split("T")[0]
      }`;
      const currentAmount =
        this.tenantState.refundCounters.get(counterKey) || 0;

      // Check daily limit (assuming 1000 minor units = $10.00)
      const dailyLimit = 1000; // This should come from policy
      const newAmount = currentAmount + amountMinor;

      if (newAmount > dailyLimit) {
        // Store idempotency result for failure
        await this.storeIdempotency(idempotencyKey, {
          success: false,
          remaining: dailyLimit - currentAmount,
          consumed: 0,
          dailyLimit,
        });

        return {
          success: false,
          remaining: dailyLimit - currentAmount,
          consumed: 0,
          dailyLimit,
          requestId: message.requestId,
        };
      }

      // Update counter atomically
      this.tenantState.refundCounters.set(counterKey, newAmount);

      // Persist to database
      await ctx.refunds.tryConsume(
        this.tenantId,
        agentId,
        currency,
        amountMinor
      );

      // Store idempotency result for success
      await this.storeIdempotency(idempotencyKey, {
        success: true,
        remaining: dailyLimit - newAmount,
        consumed: amountMinor,
        dailyLimit,
      });

      // Log decision event
      await this.appendDecisionEvent(ctx, {
        decision_id: `dec_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`,
        org_id: this.tenantId,
        agent_id: agentId,
        policy_pack_id: "refunds",
        decision: "allow",
        reason: `Refund processed: ${amountMinor} ${currency}`,
        context: JSON.stringify({
          action: "refund_consume",
          agent_id: agentId,
          currency,
          amount: amountMinor,
          remaining: dailyLimit - newAmount,
          daily_limit: dailyLimit,
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        record_hash: "",
      });

      return {
        success: true,
        remaining: dailyLimit - newAmount,
        consumed: amountMinor,
        dailyLimit,
        requestId: message.requestId,
      };
    });
  }

  // ============================================================================
  // Decision Logging
  // ============================================================================

  private async handleAppendDecision(
    message: AppendDecisionMessage
  ): Promise<{ success: boolean }> {
    const { payload: decision } = message;

    return await this.withTransaction(async (ctx) => {
      await this.appendDecisionEvent(ctx, decision);
      return { success: true };
    });
  }

  private async handleGetAuditHashes(
    message: GetAuditHashesMessage
  ): Promise<{ hashes: any[]; chainIntegrity: any }> {
    return await this.withTransaction(async (ctx) => {
      const { limit = 100, agentId, policyPackId, since } = message.payload;

      // Build query conditions
      const conditions = [ctx.decisions.org_id === this.tenantId];

      if (agentId) {
        conditions.push(ctx.decisions.agent_id === agentId);
      }

      if (policyPackId) {
        conditions.push(ctx.decisions.policy_pack_id === policyPackId);
      }

      if (since) {
        conditions.push(ctx.decisions.created_at >= since);
      }

      // Query decision events with hash chain
      const results = await ctx.decisions
        .select()
        .where(
          conditions.length > 1
            ? conditions.reduce((a, b) => a && b)
            : conditions[0]
        )
        .orderBy(ctx.decisions.created_at.desc())
        .limit(limit);

      // Verify hash chain integrity
      const chainIntegrity = this.verifyHashChain(results);

      return {
        hashes: results,
        chainIntegrity,
      };
    });
  }

  private async appendDecisionEvent(
    ctx: any,
    decision: DecisionEventRow
  ): Promise<void> {
    // Calculate hash chain
    const prevHash = this.tenantState.lastDecisionHash || "";
    const recordHash = await this.calculateRecordHash(decision, prevHash);

    // Update decision with hash chain
    const decisionWithHash = {
      ...decision,
      prev_hash: prevHash,
      record_hash: recordHash,
    };

    // Append to decision log
    await ctx.decisions.append(decisionWithHash);

    // Update state
    this.tenantState.lastDecisionHash = recordHash;
    this.tenantState.lastDecisionId = decision.decision_id;
  }

  // ============================================================================
  // Idempotency Management
  // ============================================================================

  private async checkIdempotency(
    key: string
  ): Promise<{ isIdempotent: boolean; cachedResult?: any }> {
    const cached = this.tenantState.idempotencyKeys.get(key);

    if (cached && cached.expiresAt > Date.now()) {
      return { isIdempotent: true, cachedResult: cached.result };
    }

    // Clean up expired keys
    if (cached) {
      this.tenantState.idempotencyKeys.delete(key);
    }

    return { isIdempotent: false };
  }

  private async storeIdempotency(key: string, result: any): Promise<void> {
    const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour TTL
    this.tenantState.idempotencyKeys.set(key, { result, expiresAt });
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private async initializeDbFactory(tenant: TenantRow): Promise<void> {
    if (!this.dbFactory) {
      // Use database-agnostic factory resolver
      // This will default to D1 if db_type is not specified
      this.dbFactory = createTenantDatabaseFactory(this.env, tenant);
    }
  }

  private async withTransaction<T>(fn: (ctx: any) => Promise<T>): Promise<T> {
    if (!this.dbFactory) {
      throw new Error(
        "Database factory not initialized. Call initializeDbFactory first."
      );
    }
    const { tx, repos } = await this.dbFactory.forTenant(this.tenantId);
    return await tx.run(fn);
  }

  private async calculateRecordHash(
    decision: DecisionEventRow,
    prevHash: string
  ): Promise<string> {
    const data = {
      decision_id: decision.decision_id,
      org_id: decision.org_id,
      agent_id: decision.agent_id,
      policy_pack_id: decision.policy_pack_id,
      decision: decision.decision,
      reason: decision.reason,
      context: decision.context,
      created_at: decision.created_at,
      prev_hash: prevHash,
    };

    const dataString = JSON.stringify(data, Object.keys(data).sort());
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(dataString);
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const fullHash = `sha256:${hashHex}`;

    // Validate the generated hash
    if (!this.validateHash(fullHash)) {
      throw new Error(`Invalid hash generated: ${fullHash}`);
    }

    return fullHash;
  }

  /**
   * Validate hash format and integrity
   */
  private validateHash(hash: string): boolean {
    // Check format: sha256: + 64 hex characters
    const hashPattern = /^sha256:[a-f0-9]{64}$/i;
    return hashPattern.test(hash);
  }

  private verifyHashChain(hashes: any[]): {
    valid: boolean;
    first_hash: string | null;
    last_hash: string | null;
    break_points: number[];
  } {
    if (hashes.length === 0) {
      return {
        valid: true,
        first_hash: null,
        last_hash: null,
        break_points: [],
      };
    }

    const breakPoints: number[] = [];
    let isValid = true;

    // Sort by creation time (oldest first)
    const sortedHashes = [...hashes].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Verify each hash in the chain
    for (let i = 0; i < sortedHashes.length; i++) {
      const current = sortedHashes[i];
      const previous = i > 0 ? sortedHashes[i - 1] : null;

      // Check if prev_hash matches previous record_hash
      if (previous && current.prev_hash !== previous.record_hash) {
        breakPoints.push(i);
        isValid = false;
      }

      // Verify record_hash format
      if (!current.record_hash || !current.record_hash.startsWith("sha256:")) {
        breakPoints.push(i);
        isValid = false;
      }
    }

    return {
      valid: isValid,
      first_hash: sortedHashes[0]?.record_hash || null,
      last_hash: sortedHashes[sortedHashes.length - 1]?.record_hash || null,
      break_points: breakPoints,
    };
  }

  // ============================================================================
  // Health and State Management
  // ============================================================================

  private async handleHealthCheck(): Promise<Response> {
    return new Response(
      JSON.stringify({
        success: true,
        tenantId: this.tenantId,
        activeRequests: this.tenantState.activeRequests.size,
        lastDecisionHash: this.tenantState.lastDecisionHash,
        refundCounters: this.tenantState.refundCounters.size,
        idempotencyKeys: this.tenantState.idempotencyKeys.size,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  private async handleStateRequest(): Promise<Response> {
    return new Response(
      JSON.stringify({
        tenantId: this.tenantId,
        state: {
          lastDecisionHash: this.tenantState.lastDecisionHash,
          lastDecisionId: this.tenantState.lastDecisionId,
          refundCounters: Object.fromEntries(this.tenantState.refundCounters),
          idempotencyKeys: Array.from(this.tenantState.idempotencyKeys.keys()),
          activeRequests: Array.from(this.tenantState.activeRequests),
        },
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // ============================================================================
  // Compliance Metadata Generation
  // ============================================================================

  private generateComplianceMetadata(tenantId: string): ComplianceMetadata {
    // Get tenant information to determine region and compliance level
    const region = this.getTenantRegion(tenantId);
    const complianceLevel = this.getTenantComplianceLevel(tenantId);

    return ComplianceValidator.getDefaultComplianceMetadata(
      region,
      complianceLevel
    );
  }

  private getTenantRegion(tenantId: string): string {
    // Extract region from tenant ID or use default
    // This is a simplified implementation - in practice, you'd look up the tenant
    if (tenantId.startsWith("ap_org_")) {
      // For now, default to US - in practice, this would be looked up from tenant data
      return "US";
    }
    return "US";
  }

  private getTenantComplianceLevel(tenantId: string): string {
    // Determine compliance level based on tenant
    // This is a simplified implementation - in practice, you'd look up the tenant
    if (tenantId.startsWith("ap_org_")) {
      // For now, default to standard - in practice, this would be looked up from tenant data
      return "standard";
    }
    return "standard";
  }
}

// ============================================================================
// Export for Durable Object binding
// ============================================================================

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const tenantDO = new TenantDO(ctx.state, env);
    return tenantDO.fetch(request);
  },
};
