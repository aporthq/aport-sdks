/**
 * Tenant Durable Object Client
 *
 * This client provides a convenient interface for communicating with
 * tenant-specific Durable Objects from handlers and other services.
 */

import {
  DurableObjectNamespace,
  KVNamespace,
  R2Bucket,
} from "@cloudflare/workers-types";
import {
  CreatePassportMessage,
  UpdatePassportMessage,
  StatusChangeMessage,
  RefundConsumeMessage,
  AppendDecisionMessage,
  GetAuditHashesMessage,
  InitializeTenantMessage,
  TenantResponse,
  RefundConsumeResponse,
} from "./TenantDO";
import { TenantRow } from "../adapters/ports";
import { createPassportStorageService } from "../utils/passport-storage-service";
export { TenantDO } from "./TenantDO";

// ============================================================================
// Tenant DO Client
// ============================================================================

export class TenantDOClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private storageService?: any;

  constructor(
    private tenantNamespace: DurableObjectNamespace | null,
    private tenantId: string,
    private options: {
      baseUrl?: string;
      timeout?: number;
      maxRetries?: number;
      // Storage fallback options
      kv?: KVNamespace;
      r2?: R2Bucket;
      region?: string;
      version?: string;
    } = {}
  ) {
    this.baseUrl = options.baseUrl || "http://tenant";
    this.timeout = options.timeout || 10000; // 10s default
    this.maxRetries = options.maxRetries || 3;

    // Initialize storage service for fallback operations
    if (options.kv) {
      console.log(
        "TenantDOClient: Creating storage service with KV:",
        options.kv
      );
      this.storageService = createPassportStorageService(options.kv, {
        r2: options.r2,
        region: options.region,
        version: options.version,
        tenantId: this.tenantId,
      });
      console.log(
        "TenantDOClient: Storage service created:",
        !!this.storageService
      );
    } else {
      console.log(
        "TenantDOClient: No KV provided, storage service not created"
      );
    }
  }

  private async sendMessage<T = any>(message: any): Promise<TenantResponse> {
    // If no namespace available, return stub response
    if (!this.tenantNamespace) {
      console.warn(
        "TenantDO namespace not available, using stub implementation"
      );

      // For CREATE_PASSPORT messages, return null to trigger storage fallback
      if (message.type === "CREATE_PASSPORT") {
        return {
          success: true,
          message:
            "Stub implementation - passport created without DO operations",
          data: null, // Return null to trigger storage fallback
          requestId: this.generateRequestId(),
        };
      }

      // For UPDATE_PASSPORT and STATUS_CHANGE messages, return null to trigger storage fallback
      if (
        message.type === "UPDATE_PASSPORT" ||
        message.type === "STATUS_CHANGE"
      ) {
        return {
          success: true,
          message: "Stub implementation - no actual DO operations performed",
          data: null, // Return null to trigger storage fallback
          requestId: this.generateRequestId(),
        };
      }

      // For other messages, return success with null data
      return {
        success: true,
        message: "Stub implementation - no actual DO operations performed",
        data: null,
        requestId: this.generateRequestId(),
      };
    }

    try {
      const tenantDO = this.tenantNamespace.get(
        this.tenantNamespace.idFromName(this.tenantId)
      );

      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        try {
          const response = await tenantDO.fetch(`${this.baseUrl}/message`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(message),
            signal: AbortSignal.timeout(this.timeout),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
              `TenantDO request failed (${response.status}): ${errorText}`
            );
          }

          return await response.json();
        } catch (error) {
          lastError = error as Error;

          // Don't retry on client errors (4xx)
          if (error instanceof Error && error.message.includes("4")) {
            throw error;
          }

          // Retry on server errors (5xx) or network errors
          if (attempt < this.maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // Exponential backoff, max 5s
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }
      }

      throw new Error(
        `TenantDO request failed after ${this.maxRetries + 1} attempts: ${
          lastError?.message
        }`
      );
    } catch (error) {
      console.warn("TenantDO operation failed, using stub response:", error);
      // Return a fallback response that indicates DO was skipped
      return {
        success: true,
        message:
          "Stub implementation - DO operation failed, continuing without DO",
        data: null,
        requestId: this.generateRequestId(),
      };
    }
  }

  // ============================================================================
  // Tenant Initialization
  // ============================================================================

  async initializeTenant(tenant: TenantRow): Promise<{ success: boolean }> {
    const message: InitializeTenantMessage = {
      type: "INITIALIZE_TENANT",
      payload: tenant,
      requestId: this.generateRequestId(),
    };

    const response = await this.sendMessage(message);
    if (!response.success) {
      throw new Error(response.error || "Failed to initialize tenant");
    }

    return response.data;
  }

  // ============================================================================
  // Passport Operations
  // ============================================================================

  async createPassport(passport: any): Promise<any> {
    const message: CreatePassportMessage = {
      type: "CREATE_PASSPORT",
      payload: passport,
      requestId: this.generateRequestId(),
    };

    console.log("TenantDOClient.createPassport - attempting TenantDO call");
    console.log("TenantDOClient options:", this.options);
    console.log("Passport being created:", passport.agent_id);

    const response = await this.sendMessage(message);
    if (!response.success) {
      throw new Error(response.error || "Failed to create passport");
    }

    // If TenantDO is disabled or failed, handle storage fallback
    console.log("TenantDOClient.createPassport debug:", {
      responseData: response.data,
      hasKV: !!this.options.kv,
      hasStorageService: !!this.storageService,
      tenantId: this.tenantId,
      tenantNamespace: !!this.tenantNamespace,
    });

    if (response.data === null && this.options.kv) {
      console.log(
        "TenantDO unavailable, using storage fallback for createPassport"
      );
      return await this.createPassportFallback(passport);
    }

    return response.data;
  }

  async updatePassport(passport: any, expectedVersion: number): Promise<any> {
    const message: UpdatePassportMessage = {
      type: "UPDATE_PASSPORT",
      payload: passport,
      expectedVersion,
      requestId: this.generateRequestId(),
    };

    const response = await this.sendMessage(message);
    if (!response.success) {
      throw new Error(response.error || "Failed to update passport");
    }

    // If TenantDO is disabled or failed, handle storage fallback
    if (response.data === null && this.options.kv) {
      console.log(
        "TenantDO unavailable, using storage fallback for updatePassport"
      );
      return await this.updatePassportFallback(passport);
    }

    return response.data;
  }

  async changeStatus(
    agentId: string,
    status: "draft" | "active" | "suspended" | "revoked",
    reason?: string
  ): Promise<{ success: boolean }> {
    const message: StatusChangeMessage = {
      type: "STATUS_CHANGE",
      payload: {
        agentId,
        status,
        reason,
      },
      requestId: this.generateRequestId(),
    };

    const response = await this.sendMessage(message);
    if (!response.success) {
      throw new Error(response.error || "Failed to change status");
    }

    // If TenantDO is disabled or failed, handle storage fallback
    if (response.data === null && this.options.kv) {
      console.log(
        "TenantDO unavailable, using storage fallback for changeStatus"
      );
      return await this.changeStatusFallback(agentId, status, reason);
    }

    return response.data;
  }

  // ============================================================================
  // Refund Operations
  // ============================================================================

  async consumeRefund(
    agentId: string,
    currency: string,
    amountMinor: number,
    idempotencyKey: string
  ): Promise<RefundConsumeResponse> {
    const message: RefundConsumeMessage = {
      type: "REFUND_CONSUME",
      payload: {
        agentId,
        currency,
        amountMinor,
        idempotencyKey,
      },
      requestId: this.generateRequestId(),
    };

    const response = await this.sendMessage<RefundConsumeResponse>(message);
    if (!response.success) {
      throw new Error(response.error || "Failed to consume refund");
    }

    return response.data;
  }

  // ============================================================================
  // Decision Logging
  // ============================================================================

  async appendDecision(decision: any): Promise<{ success: boolean }> {
    const message: AppendDecisionMessage = {
      type: "APPEND_DECISION",
      payload: decision,
      requestId: this.generateRequestId(),
    };

    const response = await this.sendMessage(message);
    if (!response.success) {
      throw new Error(response.error || "Failed to append decision");
    }

    return response.data;
  }

  async getAuditHashes(
    options: {
      limit?: number;
      agentId?: string;
      policyPackId?: string;
      since?: string;
    } = {}
  ): Promise<{ hashes: any[]; chainIntegrity: any }> {
    const message: GetAuditHashesMessage = {
      type: "GET_AUDIT_HASHES",
      payload: options,
      requestId: this.generateRequestId(),
    };

    const response = await this.sendMessage(message);
    if (!response.success) {
      throw new Error(response.error || "Failed to get audit hashes");
    }

    return response.data;
  }

  // ============================================================================
  // Health and Monitoring
  // ============================================================================

  async getHealth(): Promise<any> {
    if (!this.tenantNamespace) {
      console.warn(
        "TenantDO namespace not available, using stub implementation"
      );
      return {
        success: true,
        message: "Stub implementation - no actual DO operations performed",
        data: null,
        requestId: this.generateRequestId(),
      };
    }

    const tenantDO = this.tenantNamespace.get(
      this.tenantNamespace.idFromName(this.tenantId)
    );

    const response = await tenantDO.fetch("http://tenant/health");
    if (!response.ok) {
      throw new Error("Failed to get tenant health");
    }

    return await response.json();
  }

  async getState(): Promise<any> {
    if (!this.tenantNamespace) {
      console.warn(
        "TenantDO namespace not available, using stub implementation"
      );
      return {
        success: true,
        message: "Stub implementation - no actual DO operations performed",
        data: null,
        requestId: this.generateRequestId(),
      };
    }

    const tenantDO = this.tenantNamespace.get(
      this.tenantNamespace.idFromName(this.tenantId)
    );

    const response = await tenantDO.fetch("http://tenant/state");
    if (!response.ok) {
      throw new Error("Failed to get tenant state");
    }

    return await response.json();
  }

  // ============================================================================
  // Storage Fallback Methods (when TenantDO is disabled or fails)
  // ============================================================================

  /**
   * Fallback storage method for createPassport when TenantDO is unavailable
   */
  private async createPassportFallback(passport: any): Promise<any> {
    console.log("createPassportFallback called for:", passport.agent_id);
    console.log("Storage service KV namespace:", this.storageService?.kv);
    console.log("Options KV namespace:", this.options.kv);

    if (!this.storageService) {
      throw new Error("No storage service available for fallback");
    }

    try {
      console.log("Calling storageService.createPassport...");
      const result = await this.storageService.createPassport(passport, {
        createBackup: true,
        invalidateCache: true,
        preWarmCache: true,
        reason: "Passport created via TenantDO fallback",
        actor: "tenantdo-fallback",
      });

      console.log("Storage service result:", result);

      if (!result.success) {
        throw new Error(result.error || "Storage fallback failed");
      }

      console.log(`Passport ${passport.agent_id} created via storage fallback`);
      return passport;
    } catch (error) {
      console.error("Storage fallback failed:", error);
      throw new Error(
        `Failed to create passport via fallback: ${(error as Error).message}`
      );
    }
  }

  /**
   * Fallback storage method for updatePassport when TenantDO is unavailable
   */
  private async updatePassportFallback(passport: any): Promise<any> {
    if (!this.storageService) {
      throw new Error("No storage service available for fallback");
    }

    try {
      // Get current passport for comparison
      const currentPassport = (await this.options.kv?.get(
        `passport:${passport.agent_id}`,
        "json"
      )) as any;

      const result = await this.storageService.updatePassport(
        passport,
        currentPassport,
        {
          createBackup: true,
          invalidateCache: true,
          preWarmCache: true,
          reason: "Passport updated via TenantDO fallback",
          actor: "tenantdo-fallback",
        }
      );

      if (!result.success) {
        throw new Error(result.error || "Storage fallback failed");
      }

      console.log(`Passport ${passport.agent_id} updated via storage fallback`);
      return passport;
    } catch (error) {
      console.error("Storage fallback failed:", error);
      throw new Error(
        `Failed to update passport via fallback: ${(error as Error).message}`
      );
    }
  }

  /**
   * Fallback storage method for changeStatus when TenantDO is unavailable
   */
  private async changeStatusFallback(
    agentId: string,
    status: "draft" | "active" | "suspended" | "revoked",
    reason?: string
  ): Promise<{ success: boolean }> {
    if (!this.storageService) {
      throw new Error("No storage service available for fallback");
    }

    try {
      const result = await this.storageService.changeStatus(
        agentId,
        status,
        reason,
        {
          createBackup: true,
          invalidateCache: true,
          preWarmCache: true,
          reason: `Status changed to ${status} via TenantDO fallback`,
          actor: "tenantdo-fallback",
        }
      );

      if (!result.success) {
        throw new Error(result.error || "Storage fallback failed");
      }

      console.log(
        `Passport ${agentId} status changed to ${status} via storage fallback`
      );
      return { success: true };
    } catch (error) {
      console.error("Storage fallback failed:", error);
      throw new Error(
        `Failed to change status via fallback: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a TenantDO client for a specific tenant
 */
export function createTenantDOClient(
  tenantNamespace: DurableObjectNamespace,
  tenantId: string,
  options?: {
    baseUrl?: string;
    timeout?: number;
    maxRetries?: number;
  }
): TenantDOClient {
  return new TenantDOClient(tenantNamespace, tenantId, options);
}

/**
 * Create a TenantDO client from environment
 */
export function createTenantDOClientFromEnv(
  env: any,
  tenantId: string,
  options?: {
    baseUrl?: string;
    timeout?: number;
    maxRetries?: number;
    // Storage fallback options
    kv?: KVNamespace;
    r2?: R2Bucket;
    region?: string;
    version?: string;
  }
): TenantDOClient {
  if (!env.TENANT_DO) {
    console.warn(
      "TENANT_DO namespace not found in environment - using stub implementation with storage fallback"
    );
    return new TenantDOClient(null, tenantId, {
      ...options,
      kv: options?.kv || env.ai_passport_registry,
      r2: options?.r2 || env.PASSPORT_SNAPSHOTS_BUCKET,
      region: options?.region || env.DEFAULT_REGION || "US",
      version: options?.version || env.AP_VERSION || "1.0.0",
    });
  }

  return new TenantDOClient(env.TENANT_DO, tenantId, {
    ...options,
    kv: options?.kv || env.ai_passport_registry,
    r2: options?.r2 || env.PASSPORT_SNAPSHOTS_BUCKET,
    region: options?.region || env.DEFAULT_REGION || "US",
    version: options?.version || env.AP_VERSION || "1.0.0",
  });
}

// ============================================================================
// Storage Fallback Methods (when TenantDO is disabled or fails)
// ============================================================================

// ============================================================================
// Convenience Functions for Common Operations
// ============================================================================

/**
 * Create a passport through TenantDO
 */
export async function createPassportViaDO(
  tenantDO: TenantDOClient,
  passport: any
): Promise<any> {
  return await tenantDO.createPassport(passport);
}

/**
 * Update a passport through TenantDO
 */
export async function updatePassportViaDO(
  tenantDO: TenantDOClient,
  passport: any,
  expectedVersion: number
): Promise<any> {
  return await tenantDO.updatePassport(passport, expectedVersion);
}

/**
 * Process a refund through TenantDO
 */
export async function processRefundViaDO(
  tenantDO: TenantDOClient,
  agentId: string,
  currency: string,
  amountMinor: number,
  idempotencyKey: string
): Promise<RefundConsumeResponse> {
  return await tenantDO.consumeRefund(
    agentId,
    currency,
    amountMinor,
    idempotencyKey
  );
}

/**
 * Suspend a passport through TenantDO
 */
export async function suspendPassportViaDO(
  tenantDO: TenantDOClient,
  agentId: string,
  reason?: string
): Promise<{ success: boolean }> {
  return await tenantDO.changeStatus(agentId, "suspended", reason);
}

/**
 * Activate a passport through TenantDO
 */
export async function activatePassportViaDO(
  tenantDO: TenantDOClient,
  agentId: string,
  reason?: string
): Promise<{ success: boolean }> {
  return await tenantDO.changeStatus(agentId, "active", reason);
}
