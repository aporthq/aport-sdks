import { cors } from "./cors";
import { createRateLimiter, RateLimiter, RateLimitMetrics } from "./rate-limit";
import {
  ApiResponse,
  ValidationUtils,
  ERROR_MESSAGES,
  HTTP_STATUS,
} from "./api-response";
import { validateLimits, LimitValidationResult } from "./limits";
import { authMiddleware } from "./auth-middleware";
import {
  validateCategories,
  validateFrameworks,
  taxonomyValidator,
  TaxonomyValidationResult,
} from "./taxonomy";
import {
  validateAssuranceLevel,
  validateAssuranceMethod,
  createOwnerAssurance,
  updateOwnerAssurance,
  AssuranceLevel,
  AssuranceMethod,
} from "./assurance";
import { validateRegions, RegionValidationResult } from "./regions";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";

export interface BaseEnv {
  ai_passport_registry: KVNamespace;
  ADMIN_TOKEN?: string;
  VERIFY_RPM?: string;
  ADMIN_RPM?: string;
  ORG_RPM?: string;
  AP_VERSION?: string;
  REGISTRY_PRIVATE_KEY?: string;
  REGISTRY_KEY_ID?: string;
  PASSPORT_SNAPSHOTS_BUCKET?: any;
  APP_BASE_URL?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ZONE_ID?: string;
}

export interface ApiHandlerConfig {
  requireAuth?: boolean;
  rateLimitRpm?: number;
  rateLimitType?: "verify" | "admin" | "org";
  allowedMethods?: string[];
}

export abstract class BaseApiHandler {
  protected headers: Record<string, string>;
  protected response: ApiResponse;
  protected startTime: number;
  protected request: Request;
  protected env: BaseEnv;
  protected metrics: RateLimitMetrics;
  protected params?: Record<string, string>;

  constructor(
    request: Request,
    env: BaseEnv,
    config: ApiHandlerConfig = {},
    params?: Record<string, string>
  ) {
    this.request = request;
    this.env = env;
    this.startTime = Date.now();
    this.headers = cors(request);
    this.response = new ApiResponse(this.headers, env.ai_passport_registry);
    this.metrics = new RateLimitMetrics(env.ai_passport_registry);
    this.params = params;
  }

  // Abstract methods to be implemented by subclasses
  abstract handleRequest(): Promise<Response>;

  // Common validation methods
  protected validateMethod(
    allowedMethods: string[] = ["GET", "POST", "PUT", "DELETE"]
  ): Response | null {
    if (!allowedMethods.includes(this.request.method)) {
      return this.response.error(
        {
          error: "method_not_allowed",
          message: `Method ${this.request.method} not allowed`,
        },
        405
      );
    }
    return null;
  }

  protected async validateAuth(
    requireAuth: boolean = false
  ): Promise<Response | null> {
    if (!requireAuth) return null;

    // Use the proper auth middleware (allow API keys for all authenticated endpoints)
    const authResult = await authMiddleware(this.request, this.env as any, {
      requireAuth: true,
      allowApiKey: true,
      requiredApiKeyScopes: [], // Individual handlers will validate specific scopes
    });

    if (!authResult.success) {
      return this.response.unauthorized(
        authResult.error || "Authentication failed"
      );
    }

    // Add auth context to request
    (this.request as any).auth = authResult.user;

    return null;
  }

  protected async validateRateLimit(
    rpm: number = 60,
    type: "verify" | "admin" | "org" = "verify"
  ): Promise<Response | null> {
    // Use environment variables as fallback for configuration
    let actualRpm = rpm;
    if (type === "verify" && this.env.VERIFY_RPM) {
      actualRpm = parseInt(this.env.VERIFY_RPM);
    } else if (type === "admin" && this.env.ADMIN_RPM) {
      actualRpm = parseInt(this.env.ADMIN_RPM);
    } else if (type === "org" && this.env.ORG_RPM) {
      actualRpm = parseInt(this.env.ORG_RPM);
    }

    const rateLimiter = createRateLimiter(
      this.env.ai_passport_registry,
      actualRpm,
      type
    );

    const clientIP = RateLimiter.getClientIP(this.request);
    const rateLimitResult = await rateLimiter.checkLimit(clientIP);

    if (!rateLimitResult.allowed) {
      // Set rate limit info for error response
      this.response.setRateLimitInfo({
        limit: actualRpm,
        remaining: 0,
        reset: rateLimitResult.resetTime,
      });

      // Record rate limit hit for monitoring
      if (rateLimitResult.metrics) {
        await this.metrics.recordRateLimitHit(
          type,
          clientIP,
          false, // not allowed
          0, // no remaining
          rateLimitResult.metrics.totalRequests
        );
      }

      // Create error response with rate limit headers
      const errorResponse = this.response.error(
        {
          error: "rate_limit_exceeded",
          message: "Too many requests. Please try again later.",
          retry_after: rateLimitResult.retryAfter,
        },
        429
      );

      // Add retry-after header to the response
      const headers = {
        ...errorResponse.headers,
        "retry-after": rateLimitResult.retryAfter?.toString() || "60",
      };

      return new Response(
        JSON.stringify({
          error: "rate_limit_exceeded",
          message: "Too many requests. Please try again later.",
          retry_after: rateLimitResult.retryAfter,
        }),
        {
          status: 429,
          headers,
        }
      );
    }

    // Store rate limit info for successful responses
    this.response.setRateLimitInfo({
      limit: actualRpm,
      remaining: rateLimitResult.remaining,
      reset: rateLimitResult.resetTime,
    });

    // Record rate limit metrics for monitoring
    if (rateLimitResult.metrics) {
      // Log to console for debugging
      console.log(`Rate limit metrics for ${type}:`, {
        identifier: clientIP,
        type,
        limit: actualRpm,
        remaining: rateLimitResult.remaining,
        totalRequests: rateLimitResult.metrics.totalRequests,
        windowDuration:
          rateLimitResult.metrics.windowEnd -
          rateLimitResult.metrics.windowStart,
        utilizationPercent:
          (rateLimitResult.metrics.totalRequests / actualRpm) * 100,
      });

      // Record metrics for analysis
      await this.metrics.recordRateLimitHit(
        type,
        clientIP,
        true, // allowed
        rateLimitResult.remaining,
        rateLimitResult.metrics.totalRequests
      );
    }

    return null;
  }

  protected validateRequiredFields(
    body: Record<string, any>,
    requiredFields: string[]
  ): Response | null {
    const missingFields = ValidationUtils.validateRequiredFields(
      body,
      requiredFields
    );

    if (missingFields.length > 0) {
      return this.response.badRequest(
        ERROR_MESSAGES.MISSING_FIELDS,
        missingFields
      );
    }

    return null;
  }

  protected validateEmail(email: string): Response | null {
    if (!ValidationUtils.validateEmail(email)) {
      return this.response.badRequest(ERROR_MESSAGES.INVALID_EMAIL);
    }
    return null;
  }

  protected validateOwnerId(ownerId: string): Response | null {
    if (!ValidationUtils.validateOwnerId(ownerId)) {
      return this.response.badRequest(ERROR_MESSAGES.INVALID_OWNER_ID);
    }
    return null;
  }

  protected validateStatus(status: string): Response | null {
    if (!ValidationUtils.validateStatus(status)) {
      return this.response.badRequest(ERROR_MESSAGES.INVALID_STATUS);
    }
    return null;
  }

  protected validateCapabilities(capabilities: string[]): Response | null {
    const invalidCapabilities =
      ValidationUtils.validateCapabilities(capabilities);
    if (invalidCapabilities.length > 0) {
      return this.response.badRequest(
        ERROR_MESSAGES.INVALID_CAPABILITIES,
        undefined,
        { invalid_capabilities: invalidCapabilities }
      );
    }
    return null;
  }

  protected async validateCapabilityParams(
    capabilityId: string,
    params: Record<string, any>
  ): Promise<Response | null> {
    const { getCapabilityMetadata } = await import("./capabilities");
    const metadata = getCapabilityMetadata(capabilityId as any);

    if (!metadata || !metadata.paramSchema) {
      return null; // No validation required
    }

    const schema = metadata.paramSchema;
    const invalidParams: string[] = [];

    for (const [paramName, paramValue] of Object.entries(params)) {
      if (!(paramName in schema)) {
        invalidParams.push(`Unknown parameter: ${paramName}`);
        continue;
      }

      const paramDef = schema[paramName];
      const expectedType = paramDef.type;
      const actualType = typeof paramValue;

      // Type validation
      if (expectedType === "string" && actualType !== "string") {
        invalidParams.push(`Parameter ${paramName} must be a string`);
      } else if (expectedType === "number" && actualType !== "number") {
        invalidParams.push(`Parameter ${paramName} must be a number`);
      } else if (expectedType === "boolean" && actualType !== "boolean") {
        invalidParams.push(`Parameter ${paramName} must be a boolean`);
      }
    }

    // Check for missing required parameters
    for (const [paramName, paramDef] of Object.entries(schema)) {
      if ((paramDef as any).required && !(paramName in params)) {
        invalidParams.push(`Required parameter ${paramName} is missing`);
      }
    }

    if (invalidParams.length > 0) {
      return this.response.badRequest(
        `Invalid parameters for capability ${capabilityId}`,
        undefined,
        { invalid_params: invalidParams }
      );
    }

    return null;
  }

  // Common response methods
  protected async success<T>(
    data: T,
    status: number = HTTP_STATUS.OK,
    message?: string
  ) {
    const response = this.response.success(data, status, message);
    return this.response.logAndReturn(this.request, response, this.startTime);
  }

  protected async created<T>(data: T, message?: string) {
    const response = this.response.created(data, message);
    return this.response.logAndReturn(this.request, response, this.startTime);
  }

  protected async error(error: any, status: number = HTTP_STATUS.BAD_REQUEST) {
    const response = this.response.error(error, status);
    return this.response.logAndReturn(this.request, response, this.startTime);
  }

  protected async badRequest(
    message: string,
    missingFields?: string[],
    details?: Record<string, any>
  ) {
    const response = this.response.badRequest(message, missingFields, details);
    return this.response.logAndReturn(this.request, response, this.startTime);
  }

  protected async notFound(message: string = ERROR_MESSAGES.NOT_FOUND) {
    const response = this.response.notFound(message);
    return this.response.logAndReturn(this.request, response, this.startTime);
  }

  protected async conflict(message: string, details?: Record<string, any>) {
    const response = this.response.conflict(message, details);
    return this.response.logAndReturn(this.request, response, this.startTime);
  }

  protected async internalError(
    message: string = ERROR_MESSAGES.INTERNAL_ERROR
  ) {
    const response = this.response.internalError(message);
    return this.response.logAndReturn(this.request, response, this.startTime);
  }

  protected async unauthorized(message: string = "Unauthorized") {
    const response = this.response.unauthorized(message);
    return this.response.logAndReturn(this.request, response, this.startTime);
  }

  protected async forbidden(message: string = "Forbidden") {
    const response = this.response.forbidden(message);
    return this.response.logAndReturn(this.request, response, this.startTime);
  }

  protected async ok<T>(data: T, message?: string) {
    const response = this.response.success(data, HTTP_STATUS.OK, message);
    return this.response.logAndReturn(this.request, response, this.startTime);
  }

  // Main entry point
  async execute(config: ApiHandlerConfig = {}): Promise<Response> {
    try {
      // Validate method
      const methodError = this.validateMethod(config.allowedMethods);
      if (methodError) return methodError;

      // Validate auth
      const authError = await this.validateAuth(config.requireAuth);
      if (authError) return authError;

      // Validate rate limit
      const rateLimitError = await this.validateRateLimit(
        config.rateLimitRpm,
        config.rateLimitType
      );
      if (rateLimitError) return rateLimitError;

      // Execute the handler
      return await this.handleRequest();
    } catch (error) {
      console.error("API Handler Error:", error);
      return this.internalError();
    }
  }

  /**
   * Validate limits object against typed schema
   */
  protected validateLimits(limits: Record<string, any>): Response | null {
    const validation = validateLimits(limits);

    if (!validation.valid) {
      return this.response.badRequest("Invalid limits provided", undefined, {
        errors: validation.errors,
        warnings: validation.warnings,
      });
    }

    if (validation.warnings.length > 0) {
      console.warn("Limit validation warnings:", validation.warnings);
    }

    return null;
  }

  /**
   * Get limits validation result for detailed error handling
   */
  protected getLimitsValidation(
    limits: Record<string, any>
  ): LimitValidationResult {
    return validateLimits(limits);
  }

  /**
   * Validate categories against controlled enum
   */
  protected validateCategories(categories: string[]): Response | null {
    const validation = validateCategories(categories);

    if (!validation.valid) {
      return this.response.badRequest(
        "Invalid categories provided",
        undefined,
        {
          errors: validation.errors,
          warnings: validation.warnings,
          valid_categories: [
            "support",
            "commerce",
            "devops",
            "ops",
            "analytics",
            "marketing",
          ],
        }
      );
    }

    if (validation.warnings.length > 0) {
      console.warn("Category validation warnings:", validation.warnings);
    }

    return null;
  }

  /**
   * Validate frameworks against controlled enum
   */
  protected validateFrameworks(frameworks: string[]): Response | null {
    const validation = validateFrameworks(frameworks);

    if (!validation.valid) {
      return this.response.badRequest(
        "Invalid frameworks provided",
        undefined,
        {
          errors: validation.errors,
          warnings: validation.warnings,
          valid_frameworks: [
            "n8n",
            "LangGraph",
            "CrewAI",
            "AutoGen",
            "OpenAI",
            "LlamaIndex",
            "Custom",
          ],
        }
      );
    }

    if (validation.warnings.length > 0) {
      console.warn("Framework validation warnings:", validation.warnings);
    }

    return null;
  }

  /**
   * Fast taxonomy validation for edge performance
   */
  protected validateTaxonomyFast(
    categories: string[],
    frameworks: string[]
  ): Response | null {
    const categoryResult = taxonomyValidator.validateCategoriesFast(categories);
    const frameworkResult =
      taxonomyValidator.validateFrameworksFast(frameworks);

    if (!categoryResult.valid || !frameworkResult.valid) {
      const errors: string[] = [];

      if (!categoryResult.valid) {
        errors.push(`Invalid categories: ${categoryResult.invalid.join(", ")}`);
      }

      if (!frameworkResult.valid) {
        errors.push(
          `Invalid frameworks: ${frameworkResult.invalid.join(", ")}`
        );
      }

      return this.response.badRequest("Invalid taxonomy values", undefined, {
        errors,
      });
    }

    return null;
  }

  /**
   * Get taxonomy validation result for detailed error handling
   */
  protected getTaxonomyValidation(
    categories: string[],
    frameworks: string[]
  ): {
    categories: TaxonomyValidationResult;
    frameworks: TaxonomyValidationResult;
  } {
    return {
      categories: validateCategories(categories),
      frameworks: validateFrameworks(frameworks),
    };
  }

  /**
   * Validate assurance level
   */
  protected validateAssuranceLevel(level: string): Response | null {
    const validation = validateAssuranceLevel(level);

    if (!validation.valid) {
      return this.response.badRequest(
        "Invalid assurance level provided",
        undefined,
        {
          error: validation.error,
          valid_levels: ["L0", "L1", "L2", "L3", "L4KYC", "L4FIN"],
        }
      );
    }

    return null;
  }

  /**
   * Validate assurance method
   */
  protected validateAssuranceMethod(method: string): Response | null {
    const validation = validateAssuranceMethod(method);

    if (!validation.valid) {
      return this.response.badRequest(
        "Invalid assurance method provided",
        undefined,
        {
          error: validation.error,
          valid_methods: [
            "self_attested",
            "email_verified",
            "github_verified",
            "domain_verified",
            "kyc_verified",
            "kyb_verified",
            "financial_data_verified",
          ],
        }
      );
    }

    return null;
  }

  /**
   * Validate regions (ISO-3166 country codes)
   */
  protected validateRegions(regions: string[]): Response | null {
    const validation = validateRegions(regions);
    if (!validation.valid) {
      return this.response.badRequest(
        `Invalid regions: ${validation.errors.join(", ")}`,
        undefined,
        {
          invalid_regions: validation.errors,
          warnings: validation.warnings,
        }
      );
    }
    return null;
  }

  /**
   * Create owner assurance record
   */
  protected createOwnerAssurance(
    verificationMethods: AssuranceMethod[],
    evidence?: Record<string, any>,
    expiresAt?: string
  ) {
    return createOwnerAssurance(verificationMethods, evidence, expiresAt);
  }

  /**
   * Update owner assurance record
   */
  protected updateOwnerAssurance(
    current: any,
    newVerificationMethods: AssuranceMethod[],
    evidence?: Record<string, any>,
    expiresAt?: string
  ) {
    return updateOwnerAssurance(
      current,
      newVerificationMethods,
      evidence,
      expiresAt
    );
  }
}

// Factory function for creating handlers
export function createApiHandler<T extends BaseApiHandler>(
  HandlerClass: new (
    request: Request,
    env: BaseEnv,
    config?: ApiHandlerConfig,
    params?: Record<string, string>
  ) => T,
  config: ApiHandlerConfig = {}
) {
  return async ({
    request,
    env,
    params,
  }: {
    request: Request;
    env: BaseEnv;
    params?: Record<string, string>;
  }) => {
    const handler = new HandlerClass(request, env, config, params);
    return handler.execute(config);
  };
}
