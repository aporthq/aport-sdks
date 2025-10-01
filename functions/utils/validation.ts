/**
 * Validation Utilities
 *
 * Centralized utilities for common validation operations
 * used across different policy packs.
 */

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  code?: string;
}

export interface FieldValidation {
  field: string;
  value: any;
  required: boolean;
  validator: (value: any) => ValidationResult;
}

/**
 * Validate required fields
 */
export function validateRequiredFields(
  context: Record<string, any>,
  requiredFields: string[]
): ValidationResult[] {
  const results: ValidationResult[] = [];

  for (const field of requiredFields) {
    if (!context[field]) {
      results.push({
        valid: false,
        reason: `Required field '${field}' is missing`,
        code: "missing_required_field",
      });
    }
  }

  return results;
}

/**
 * Validate field against allowed values
 */
export function validateAllowedValues(
  value: any,
  allowedValues: any[],
  fieldName: string
): ValidationResult {
  if (allowedValues.length === 0) {
    return { valid: true };
  }

  if (!allowedValues.includes(value)) {
    return {
      valid: false,
      reason: `Invalid ${fieldName} '${value}'. Allowed: ${allowedValues.join(
        ", "
      )}`,
      code: "invalid_value",
    };
  }

  return { valid: true };
}

/**
 * Validate region against allowed regions
 */
export function validateRegion(
  region: string,
  allowedRegions: string[]
): ValidationResult {
  if (!region) {
    return {
      valid: false,
      reason: "Region is required",
      code: "missing_region",
    };
  }

  if (!allowedRegions.includes(region) && !allowedRegions.includes("global")) {
    return {
      valid: false,
      reason: `Agent not authorized for region ${region}. Allowed: ${allowedRegions.join(
        ", "
      )}`,
      code: "region_not_allowed",
    };
  }

  return { valid: true };
}

/**
 * Validate string format with regex
 */
export function validateStringFormat(
  value: string,
  pattern: RegExp,
  fieldName: string,
  errorMessage: string
): ValidationResult {
  if (!pattern.test(value)) {
    return {
      valid: false,
      reason: `${fieldName}: ${errorMessage}`,
      code: "invalid_format",
    };
  }

  return { valid: true };
}

/**
 * Validate string length
 */
export function validateStringLength(
  value: string,
  minLength: number,
  maxLength: number,
  fieldName: string
): ValidationResult {
  if (value.length < minLength) {
    return {
      valid: false,
      reason: `${fieldName} must be at least ${minLength} characters`,
      code: "too_short",
    };
  }

  if (value.length > maxLength) {
    return {
      valid: false,
      reason: `${fieldName} must be no more than ${maxLength} characters`,
      code: "too_long",
    };
  }

  return { valid: true };
}

/**
 * Validate number range
 */
export function validateNumberRange(
  value: number,
  min: number,
  max: number,
  fieldName: string
): ValidationResult {
  if (value < min) {
    return {
      valid: false,
      reason: `${fieldName} must be at least ${min}`,
      code: "below_minimum",
    };
  }

  if (value > max) {
    return {
      valid: false,
      reason: `${fieldName} must be no more than ${max}`,
      code: "above_maximum",
    };
  }

  return { valid: true };
}

/**
 * Validate array length
 */
export function validateArrayLength(
  value: any[],
  minLength: number,
  maxLength: number,
  fieldName: string
): ValidationResult {
  if (value.length < minLength) {
    return {
      valid: false,
      reason: `${fieldName} must have at least ${minLength} items`,
      code: "too_few_items",
    };
  }

  if (value.length > maxLength) {
    return {
      valid: false,
      reason: `${fieldName} must have no more than ${maxLength} items`,
      code: "too_many_items",
    };
  }

  return { valid: true };
}

/**
 * Validate email format
 */
export function validateEmail(email: string): ValidationResult {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return validateStringFormat(
    email,
    emailPattern,
    "Email",
    "Invalid email format"
  );
}

/**
 * Validate URL format
 */
export function validateUrl(url: string): ValidationResult {
  try {
    new URL(url);
    return { valid: true };
  } catch {
    return {
      valid: false,
      reason: "Invalid URL format",
      code: "invalid_url",
    };
  }
}

/**
 * Validate JSON format
 */
export function validateJson(jsonString: string): ValidationResult {
  try {
    JSON.parse(jsonString);
    return { valid: true };
  } catch {
    return {
      valid: false,
      reason: "Invalid JSON format",
      code: "invalid_json",
    };
  }
}

/**
 * Validate boolean value
 */
export function validateBoolean(value: any): ValidationResult {
  if (typeof value !== "boolean") {
    return {
      valid: false,
      reason: "Value must be a boolean",
      code: "invalid_boolean",
    };
  }

  return { valid: true };
}

/**
 * Validate integer value
 */
export function validateInteger(value: any): ValidationResult {
  if (!Number.isInteger(value)) {
    return {
      valid: false,
      reason: "Value must be an integer",
      code: "invalid_integer",
    };
  }

  return { valid: true };
}

/**
 * Validate positive number
 */
export function validatePositiveNumber(value: number): ValidationResult {
  if (value <= 0) {
    return {
      valid: false,
      reason: "Value must be positive",
      code: "not_positive",
    };
  }

  return { valid: true };
}

/**
 * Validate finite number
 */
export function validateFiniteNumber(value: number): ValidationResult {
  if (!Number.isFinite(value)) {
    return {
      valid: false,
      reason: "Value must be a finite number",
      code: "not_finite",
    };
  }

  return { valid: true };
}

/**
 * Combine multiple validation results
 */
export function combineValidationResults(
  results: ValidationResult[]
): ValidationResult {
  const failedResults = results.filter((r) => !r.valid);

  if (failedResults.length === 0) {
    return { valid: true };
  }

  return {
    valid: false,
    reason: failedResults.map((r) => r.reason).join("; "),
    code: failedResults[0].code,
  };
}

/**
 * Validate all fields in a context
 */
export function validateContext(
  context: Record<string, any>,
  fieldValidations: FieldValidation[]
): ValidationResult[] {
  const results: ValidationResult[] = [];

  for (const fieldValidation of fieldValidations) {
    const { field, value, required, validator } = fieldValidation;

    if (required && !value) {
      results.push({
        valid: false,
        reason: `Required field '${field}' is missing`,
        code: "missing_required_field",
      });
      continue;
    }

    if (value !== undefined && value !== null) {
      const result = validator(value);
      if (!result.valid) {
        results.push({
          ...result,
          reason: `${field}: ${result.reason}`,
        });
      }
    }
  }

  return results;
}
