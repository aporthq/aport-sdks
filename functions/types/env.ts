/**
 * Shared Environment Interface Definitions
 *
 * Centralized type definitions to reduce duplication across the codebase.
 * This file provides common environment interfaces used throughout the application.
 */

import {
  KVNamespace,
  R2Bucket,
  D1Database,
  DurableObjectNamespace,
} from "@cloudflare/workers-types";

/**
 * Base environment interface with core platform bindings
 */
export interface BaseEnv {
  // Core platform bindings
  ai_passport_registry: KVNamespace;
  APORT_R2: R2Bucket;
  APORT_SECRET: string;
  APORT_COUNTERS: DurableObjectNamespace;
  AP_VERSION: string;

  // Optional platform settings
  VERIFY_RPM?: string;
  REGISTRY_PRIVATE_KEY?: string;
  JWT_SECRET: string;
  DEFAULT_REGION?: string;
}

/**
 * Multi-region environment interface extending base environment
 * Includes all region-specific bindings for US, EU, CA, AP, AU, BR
 */
export interface MultiRegionEnv extends BaseEnv {
  // US Region
  D1_US?: D1Database;
  KV_US?: KVNamespace;
  R2_US?: R2Bucket;

  // EU Region
  D1_EU?: D1Database;
  KV_EU?: KVNamespace;
  R2_EU?: R2Bucket;

  // CA Region
  D1_CA?: D1Database;
  KV_CA?: KVNamespace;
  R2_CA?: R2Bucket;

  // AP Region (Asia Pacific)
  D1_AP?: D1Database;
  KV_AP?: KVNamespace;
  R2_AP?: R2Bucket;

  // AU Region (Australia)
  D1_AU?: D1Database;
  KV_AU?: KVNamespace;
  R2_AU?: R2Bucket;

  // BR Region (Brazil)
  D1_BR?: D1Database;
  KV_BR?: KVNamespace;
  R2_BR?: R2Bucket;
}

/**
 * Standard API response interface
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  requestId?: string;
}

/**
 * Paginated API response interface
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/**
 * Standard error response interface
 */
export interface ErrorResponse {
  error: string;
  message: string;
  requestId?: string;
  details?: Record<string, any>;
}

/**
 * Region binding interface for type safety
 */
export interface RegionBindings {
  d1?: D1Database;
  kv?: KVNamespace;
  r2?: R2Bucket;
}

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validation error interface
 */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

/**
 * Request context interface for logging
 */
export interface RequestContext {
  clientIP?: string;
  userAgent?: string;
  cfRay?: string;
  isBot?: boolean;
  isBrowser?: boolean;
  requestId?: string;
  latency?: number;
  region?: string;
  tenantId?: string;
  agentId?: string;
}

// Logger interface is defined in functions/utils/logger.ts
// Re-export it here for convenience
export type { Logger } from "../utils/logger";
