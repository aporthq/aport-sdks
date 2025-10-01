/**
 * Centralized Error Handling Utility
 *
 * Provides consistent error handling patterns across all endpoints
 * to reduce duplication and improve maintainability.
 */

import { Logger, ErrorResponse } from "../types/env";

export class ErrorHandler {
  /**
   * Log error with consistent formatting
   */
  static async logError(
    logger: Logger,
    context: string,
    error: Error | unknown,
    metadata?: Record<string, any>
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    await logger.logError(`${context}:`, {
      error: errorMessage,
      stack: errorStack,
      ...metadata,
    });
  }

  /**
   * Create standardized error response
   */
  static createErrorResponse(
    error: string,
    message: string,
    status: number = 500,
    requestId?: string,
    details?: Record<string, any>
  ): Response {
    const errorResponse: ErrorResponse = {
      error,
      message,
      requestId,
      details,
    };

    return new Response(JSON.stringify(errorResponse), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  /**
   * Handle async errors with consistent error responses
   */
  static handleAsyncError(fn: () => Promise<Response>): Promise<Response> {
    return fn().catch((error) => {
      console.error("Unhandled async error:", error);
      return this.createErrorResponse(
        "internal_server_error",
        "An unexpected error occurred",
        500
      );
    });
  }

  /**
   * Create validation error response
   */
  static createValidationError(
    message: string,
    details?: Record<string, any>,
    requestId?: string
  ): Response {
    return this.createErrorResponse(
      "validation_error",
      message,
      400,
      requestId,
      details
    );
  }

  /**
   * Create not found error response
   */
  static createNotFoundError(resource: string, requestId?: string): Response {
    return this.createErrorResponse(
      "not_found",
      `${resource} not found`,
      404,
      requestId
    );
  }

  /**
   * Create unauthorized error response
   */
  static createUnauthorizedError(
    message: string = "Unauthorized",
    requestId?: string
  ): Response {
    return this.createErrorResponse("unauthorized", message, 401, requestId);
  }

  /**
   * Create forbidden error response
   */
  static createForbiddenError(
    message: string = "Forbidden",
    requestId?: string
  ): Response {
    return this.createErrorResponse("forbidden", message, 403, requestId);
  }

  /**
   * Create rate limit error response
   */
  static createRateLimitError(
    message: string = "Rate limit exceeded",
    requestId?: string,
    retryAfter?: number
  ): Response {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (retryAfter) {
      headers["Retry-After"] = retryAfter.toString();
    }

    const errorResponse: ErrorResponse = {
      error: "rate_limit_exceeded",
      message,
      requestId,
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 429,
      headers,
    });
  }

  /**
   * Create region configuration error response
   */
  static createRegionConfigError(
    region: string,
    missing: string[],
    requestId?: string
  ): Response {
    return this.createErrorResponse(
      "region_not_configured",
      `Region ${region} is not properly configured`,
      400,
      requestId,
      { missing }
    );
  }

  /**
   * Create tenant not found error response
   */
  static createTenantNotFoundError(
    tenantId: string,
    requestId?: string
  ): Response {
    return this.createErrorResponse(
      "tenant_not_found",
      `Tenant ${tenantId} not found`,
      404,
      requestId
    );
  }

  /**
   * Create agent not indexed error response
   */
  static createAgentNotIndexedError(
    agentId: string,
    requestId?: string
  ): Response {
    return this.createErrorResponse(
      "agent_not_indexed",
      `Agent ${agentId} is not indexed for routing`,
      403,
      requestId
    );
  }
}
