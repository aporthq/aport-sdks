/**
 * Centralized Validation for Policy Verification
 *
 * Provides validation utilities for policy verification using the robust
 * validation utilities from the main functions/utils directory.
 */

import { DecisionReason } from "../../../shared/types/decision";
import {
  validateRequiredFields,
  validateAllowedValues,
  validateRegion,
  validateStringFormat,
  validateNumberRange,
  validateEmailFormat,
  validateUrlFormat,
} from "../validation";

export async function validatePolicyFields(
  context: Record<string, any>,
  requiredFields: string[]
): Promise<{ allow: boolean; reasons: DecisionReason[] }> {
  const reasons: DecisionReason[] = [];

  // Validate required fields using robust utility
  const validationResults = validateRequiredFields(context, requiredFields);

  for (const result of validationResults) {
    if (!result.valid) {
      reasons.push({
        code: result.code || "MISSING_REQUIRED_FIELD",
        message: result.reason || "Required field is missing",
        severity: "error",
      });
    }
  }

  return {
    allow: reasons.length === 0,
    reasons,
  };
}

export async function validateFieldValues(
  context: Record<string, any>,
  fieldValidations: Array<{
    field: string;
    allowedValues?: any[];
    format?: "string" | "number" | "email" | "url";
    min?: number;
    max?: number;
  }>
): Promise<{ allow: boolean; reasons: DecisionReason[] }> {
  const reasons: DecisionReason[] = [];

  for (const validation of fieldValidations) {
    const value = context[validation.field];

    if (value === undefined || value === null) {
      continue; // Skip validation for missing fields (handled by required field validation)
    }

    // Validate allowed values
    if (validation.allowedValues) {
      const result = validateAllowedValues(
        value,
        validation.allowedValues,
        validation.field
      );
      if (!result.valid) {
        reasons.push({
          code: result.code || "INVALID_VALUE",
          message: result.reason || `Invalid value for ${validation.field}`,
          severity: "error",
        });
      }
    }

    // Validate format
    if (validation.format) {
      let result;
      switch (validation.format) {
        case "string":
          result = validateStringFormat(value, /^.+$/, validation.field);
          break;
        case "number":
          result = validateNumberRange(
            value,
            validation.min,
            validation.max,
            validation.field
          );
          break;
        case "email":
          result = validateEmailFormat(value, validation.field);
          break;
        case "url":
          result = validateUrlFormat(value, validation.field);
          break;
      }

      if (result && !result.valid) {
        reasons.push({
          code: result.code || "INVALID_FORMAT",
          message: result.reason || `Invalid format for ${validation.field}`,
          severity: "error",
        });
      }
    }
  }

  return {
    allow: reasons.length === 0,
    reasons,
  };
}

export async function validateRegionAccess(
  region: string,
  allowedRegions: string[]
): Promise<{ allow: boolean; reasons: DecisionReason[] }> {
  const reasons: DecisionReason[] = [];

  // Validate region using robust utility
  const result = validateRegion(region, allowedRegions);

  if (!result.valid) {
    reasons.push({
      code: result.code || "REGION_NOT_ALLOWED",
      message: result.reason || "Region not allowed",
      severity: "error",
    });
  }

  return {
    allow: reasons.length === 0,
    reasons,
  };
}
