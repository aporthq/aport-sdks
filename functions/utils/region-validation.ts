/**
 * Consolidated Region Validation Service
 *
 * Centralized region validation logic to eliminate duplication
 * across multiple files and provide consistent validation behavior.
 */

import { ValidationResult, ValidationError } from "../types/env";
import { getRegionConfig, REGION_CONFIGS } from "./region-config";

export class RegionValidationService {
  private static instance: RegionValidationService;
  private cache: Map<string, boolean> = new Map();
  private validationCache: Map<string, ValidationResult> = new Map();

  static getInstance(): RegionValidationService {
    if (!this.instance) {
      this.instance = new RegionValidationService();
    }
    return this.instance;
  }

  /**
   * Validate country code format and existence
   */
  isValidCountryCode(code: string): boolean {
    if (this.cache.has(code)) {
      return this.cache.get(code)!;
    }

    const isValid =
      /^[A-Z]{2}$/.test(code) && Object.keys(REGION_CONFIGS).includes(code);

    this.cache.set(code, isValid);
    return isValid;
  }

  /**
   * Validate region against allowed regions
   */
  validateRegion(region: string, allowedRegions: string[]): ValidationResult {
    const cacheKey = `${region}:${allowedRegions.join(",")}`;

    if (this.validationCache.has(cacheKey)) {
      return this.validationCache.get(cacheKey)!;
    }

    const result: ValidationResult = {
      valid: true,
      errors: [],
    };

    if (!this.isValidCountryCode(region)) {
      result.valid = false;
      result.errors.push({
        field: "region",
        message: `Region ${region} is not a valid ISO-3166 country code`,
        code: "INVALID_REGION",
      });
    }

    if (allowedRegions.length > 0 && !allowedRegions.includes(region)) {
      result.valid = false;
      result.errors.push({
        field: "region",
        message: `Region ${region} is not allowed`,
        code: "REGION_NOT_ALLOWED",
      });
    }

    this.validationCache.set(cacheKey, result);
    return result;
  }

  /**
   * Validate region configuration completeness
   */
  validateRegionConfiguration(region: string, env: any): ValidationResult {
    const cacheKey = `config:${region}:${JSON.stringify(env)}`;

    if (this.validationCache.has(cacheKey)) {
      return this.validationCache.get(cacheKey)!;
    }

    const result: ValidationResult = {
      valid: true,
      errors: [],
    };

    const regionConfig = getRegionConfig(region);
    if (!regionConfig) {
      result.valid = false;
      result.errors.push({
        field: "region",
        message: `Region ${region} is not supported`,
        code: "UNSUPPORTED_REGION",
      });
      return result;
    }

    // Check D1 binding
    if (!env[regionConfig.bindings.d1]) {
      result.valid = false;
      result.errors.push({
        field: "d1",
        message: `D1 binding ${regionConfig.bindings.d1} is missing`,
        code: "MISSING_D1_BINDING",
      });
    }

    // Check KV binding
    if (!env[regionConfig.bindings.kv]) {
      result.valid = false;
      result.errors.push({
        field: "kv",
        message: `KV binding ${regionConfig.bindings.kv} is missing`,
        code: "MISSING_KV_BINDING",
      });
    }

    // Check R2 binding
    if (!env[regionConfig.bindings.r2]) {
      result.valid = false;
      result.errors.push({
        field: "r2",
        message: `R2 binding ${regionConfig.bindings.r2} is missing`,
        code: "MISSING_R2_BINDING",
      });
    }

    this.validationCache.set(cacheKey, result);
    return result;
  }

  /**
   * Validate region availability for tenant creation
   */
  validateRegionAvailability(region: string): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
    };

    const regionConfig = getRegionConfig(region);
    if (!regionConfig) {
      result.valid = false;
      result.errors.push({
        field: "region",
        message: `Region ${region} is not supported`,
        code: "UNSUPPORTED_REGION",
      });
      return result;
    }

    if (regionConfig.status !== "available") {
      result.valid = false;
      result.errors.push({
        field: "region",
        message: `Region ${region} is not available for tenant creation (status: ${regionConfig.status})`,
        code: "REGION_UNAVAILABLE",
      });
    }

    return result;
  }

  /**
   * Clear all caches (useful for testing)
   */
  clearCaches(): void {
    this.cache.clear();
    this.validationCache.clear();
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): {
    countryCodeCacheSize: number;
    validationCacheSize: number;
  } {
    return {
      countryCodeCacheSize: this.cache.size,
      validationCacheSize: this.validationCache.size,
    };
  }
}

// Export singleton instance
export const regionValidator = RegionValidationService.getInstance();
