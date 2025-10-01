import { KVNamespace } from "@cloudflare/workers-types";
import { createLogger } from "./logger";
import { CAPABILITIES } from "./capabilities";
import { CapabilityId } from "../../types/owner";
// Common response types
export interface ApiError {
  error: string;
  message: string;
  missing_fields?: string[];
  details?: Record<string, any>;
  retry_after?: number;
}

export interface ApiSuccess<T = any> {
  ok: boolean;
  message?: string;
  data?: T;
  [key: string]: any;
}

// Common HTTP status codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// Rate limit info interface
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}

// Response builder class
export class ApiResponse {
  private headers: Record<string, string>;
  private logger: ReturnType<typeof createLogger>;
  private rateLimitInfo?: RateLimitInfo;

  constructor(headers: Record<string, string>, kv: KVNamespace) {
    this.headers = headers;
    this.logger = createLogger(kv);
  }

  // Set rate limit information for responses
  setRateLimitInfo(info: RateLimitInfo) {
    this.rateLimitInfo = info;
  }

  // Get rate limit headers
  private getRateLimitHeaders(): Record<string, string> {
    if (!this.rateLimitInfo) return {};

    return {
      "x-ratelimit-limit": this.rateLimitInfo.limit.toString(),
      "x-ratelimit-remaining": this.rateLimitInfo.remaining.toString(),
      "x-ratelimit-reset": new Date(this.rateLimitInfo.reset).toISOString(),
    };
  }

  // Success responses
  success<T>(data: T, status: number = HTTP_STATUS.OK, message?: string) {
    const response: ApiSuccess<T> = {
      ok: true,
      message: message || undefined,
      data: data || undefined,
    };

    return new Response(JSON.stringify(response), {
      status,
      headers: {
        "content-type": "application/json",
        ...this.headers,
        ...this.getRateLimitHeaders(),
      },
    });
  }

  created<T>(data: T, message?: string) {
    return this.success(data, HTTP_STATUS.CREATED, message);
  }

  // Error responses
  error(error: ApiError, status: number = HTTP_STATUS.BAD_REQUEST) {
    return new Response(JSON.stringify(error), {
      status,
      headers: {
        "content-type": "application/json",
        ...this.headers,
        ...this.getRateLimitHeaders(),
      },
    });
  }

  badRequest(
    message: string,
    missingFields?: string[],
    details?: Record<string, any>
  ) {
    return this.error(
      {
        error: "bad_request",
        message,
        ...(missingFields && { missing_fields: missingFields }),
        ...(details && { details }),
      },
      HTTP_STATUS.BAD_REQUEST
    );
  }

  unauthorized(message: string = "Unauthorized") {
    return this.error(
      {
        error: "unauthorized",
        message,
      },
      HTTP_STATUS.UNAUTHORIZED
    );
  }

  forbidden(message: string = "Forbidden") {
    return this.error(
      {
        error: "forbidden",
        message,
      },
      HTTP_STATUS.FORBIDDEN
    );
  }

  notFound(message: string = "Resource not found") {
    return this.error(
      {
        error: "not_found",
        message,
      },
      HTTP_STATUS.NOT_FOUND
    );
  }

  conflict(message: string, details?: Record<string, any>) {
    return this.error(
      {
        error: "conflict",
        message,
        ...(details && { details }),
      },
      HTTP_STATUS.CONFLICT
    );
  }

  internalError(message: string = "Internal server error") {
    return this.error(
      {
        error: "internal_server_error",
        message,
      },
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }

  // Log and return response
  async logAndReturn(
    request: Request,
    response: Response,
    startTime: number,
    metadata?: Record<string, any>
  ) {
    await this.logger.logRequest(request, response, startTime, metadata);
    return response;
  }
}

// Validation utilities
export class ValidationUtils {
  static validateRequiredFields(
    body: Record<string, any>,
    requiredFields: string[]
  ): string[] {
    return requiredFields.filter((field) => {
      const value = body[field];
      return (
        value === undefined ||
        value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0)
      );
    });
  }

  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static validateOwnerId(ownerId: string): boolean {
    return ownerId.startsWith("ap_org_") || ownerId.startsWith("ap_user_");
  }

  static validateStatus(status: string): boolean {
    return ["draft", "active", "suspended", "revoked"].includes(status);
  }

  static validateAssuranceLevel(level: string): boolean {
    return ["L0", "L1", "L2", "L3", "L4KYC", "L4FIN"].includes(level);
  }

  static validateCapabilities(capabilities: string[]): string[] {
    // Basic validation - full validation is done in BaseApiHandler
    // This is a simplified version to avoid circular dependencies
    const validCapabilities = CAPABILITIES;
    return capabilities.filter(
      (cap) => !validCapabilities.includes(cap as CapabilityId)
    );
  }

  static validateCapabilityObjects(capabilities: any[]): {
    valid: boolean;
    error?: string;
  } {
    if (!Array.isArray(capabilities)) {
      return { valid: false, error: "capabilities must be an array" };
    }

    // Validate each capability structure according to Capability type
    for (let i = 0; i < capabilities.length; i++) {
      const capability = capabilities[i];
      if (!capability || typeof capability !== "object") {
        return { valid: false, error: `capabilities[${i}] must be an object` };
      }
      if (!capability.id || typeof capability.id !== "string") {
        return {
          valid: false,
          error: `capabilities[${i}].id must be a string`,
        };
      }
      if (capability.params && typeof capability.params !== "object") {
        return {
          valid: false,
          error: `capabilities[${i}].params must be an object`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Admin-only fields that require admin privileges to modify
   */
  static readonly ADMIN_ONLY_FIELDS = [
    "assurance_level",
    "assurance_method",
    "assurance_verified_at",
    "verification_status",
    "verification_method",
    "verification_evidence",
    "registry_key_id",
    "registry_sig",
    "canonical_hash",
    "verified_at",
    "source",
    "creator_id",
    "creator_type",
  ] as const;

  /**
   * Validate admin-only fields access
   */
  static validateAdminFields(
    body: Record<string, any>,
    isAdmin: boolean
  ): { valid: boolean; error?: string; restrictedFields?: string[] } {
    const restrictedFields: string[] = [];

    for (const field of this.ADMIN_ONLY_FIELDS) {
      if (body[field] !== undefined && !isAdmin) {
        restrictedFields.push(field);
      }
    }

    if (restrictedFields.length > 0) {
      return {
        valid: false,
        error: `Admin privileges required to modify fields: ${restrictedFields.join(
          ", "
        )}`,
        restrictedFields,
      };
    }

    return { valid: true };
  }

  /**
   * Validate assurance level changes (admin-only for high levels)
   */
  static validateAssuranceLevelChange(
    currentLevel: string,
    newLevel: string,
    isAdmin: boolean
  ): { valid: boolean; error?: string } {
    const highAssuranceLevels = ["L3", "L4KYC", "L4FIN"];

    // Non-admins can only set L0, L1, L2
    if (!isAdmin && highAssuranceLevels.includes(newLevel)) {
      return {
        valid: false,
        error: `Admin privileges required to set assurance level ${newLevel}`,
      };
    }

    // Validate assurance level format
    if (!this.validateAssuranceLevel(newLevel)) {
      return {
        valid: false,
        error: `Invalid assurance level: ${newLevel}`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate verification status changes (admin-only)
   */
  static validateVerificationStatusChange(
    currentStatus: string,
    newStatus: string,
    isAdmin: boolean
  ): { valid: boolean; error?: string } {
    // Only admins can change verification status
    if (!isAdmin && currentStatus !== newStatus) {
      return {
        valid: false,
        error: "Admin privileges required to change verification status",
      };
    }

    // Validate verification status format
    const validStatuses = ["unverified", "email_verified", "github_verified"];
    if (!validStatuses.includes(newStatus)) {
      return {
        valid: false,
        error: `Invalid verification status: ${newStatus}`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate source field changes (admin-only for "admin" source)
   */
  static validateSourceChange(
    currentSource: string,
    newSource: string,
    isAdmin: boolean
  ): { valid: boolean; error?: string } {
    // Only admins can set source to "admin"
    if (newSource === "admin" && !isAdmin) {
      return {
        valid: false,
        error: "Admin privileges required to set source as 'admin'",
      };
    }

    // Validate source format
    const validSources = ["admin", "form", "crawler"];
    if (!validSources.includes(newSource)) {
      return {
        valid: false,
        error: `Invalid source: ${newSource}`,
      };
    }

    return { valid: true };
  }
}

// Common error messages
export const ERROR_MESSAGES = {
  MISSING_FIELDS: "Missing required fields",
  INVALID_EMAIL: "Invalid email format",
  INVALID_OWNER_ID: "Invalid owner ID format",
  INVALID_STATUS:
    "Invalid status. Must be one of: draft, active, suspended, revoked",
  INVALID_CAPABILITIES: "Invalid capability IDs provided",
  UNAUTHORIZED: "Unauthorized access",
  FORBIDDEN: "Access forbidden",
  NOT_FOUND: "Resource not found",
  CONFLICT: "Resource already exists",
  INTERNAL_ERROR: "Internal server error",
} as const;
