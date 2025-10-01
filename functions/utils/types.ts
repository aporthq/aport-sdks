/**
 * Types for policy utilities
 */

import {
  KVNamespace,
  R2Bucket,
  DurableObjectNamespace,
} from "@cloudflare/workers-types";

export interface Env {
  ai_passport_registry: KVNamespace;
  APORT_R2: R2Bucket;
  APORT_SECRET: string;
  APORT_COUNTERS: DurableObjectNamespace;
  AP_VERSION: string;
  VERIFY_RPM?: string;
}

export interface PolicyEvaluationResult {
  allow: boolean;
  reasons: DecisionReason[];
}

export interface DecisionReason {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
}
