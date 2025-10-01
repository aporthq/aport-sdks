/**
 * Data Export Policy Evaluator
 *
 * Evaluates data export requests against the data.export.v1 policy pack.
 */

import { PassportData } from "../../../types/passport";
import { Decision, DecisionReason } from "../../../shared/types/decision";
import { Env } from "../types";
import { meetsMinimumAssurance } from "../assurance";

export async function evaluateDataExportV1(
  env: Env,
  passport: PassportData,
  context: Record<string, any>,
  idempotencyKey?: string
): Promise<Decision> {
  const decisionId = generateDecisionId();
  const reasons: DecisionReason[] = [];
  let allow = true;

  // 0. Check agent status (suspended agents should not pass)
  if (passport.status === "suspended" || passport.status === "revoked") {
    return {
      decision_id: decisionId,
      allow: false,
      reasons: [
        {
          code: "AGENT_SUSPENDED",
          message: `Agent is ${passport.status} and cannot perform operations`,
          severity: "error",
        },
      ],
      expires_in: 60,
      created_at: new Date().toISOString(),
    };
  }

  // 1. Check capabilities (data.export)
  const agentCapabilities = passport.capabilities || [];
  const hasExportCapability = agentCapabilities.some(
    (cap: any) => (typeof cap === "string" ? cap : cap.id) === "data.export"
  );

  if (!hasExportCapability) {
    allow = false;
    reasons.push({
      code: "INSUFFICIENT_CAPABILITIES",
      message: "Missing required capability: data.export",
      severity: "error",
    });
  }

  // 2. Check row limits
  const maxRows = passport.limits?.max_export_rows || 1000;
  if (context.rows && context.rows > maxRows) {
    allow = false;
    reasons.push({
      code: "ROW_LIMIT_EXCEEDED",
      message: `Row count ${context.rows} exceeds limit of ${maxRows}`,
      severity: "error",
    });
  }

  // 3. Check PII handling
  const allowPII = passport.limits?.allow_pii || false;
  if (context.include_pii && !allowPII) {
    allow = false;
    reasons.push({
      code: "PII_NOT_ALLOWED",
      message: "PII export is not allowed for this agent",
      severity: "error",
    });
  }

  // 4. Check format restrictions
  const allowedFormats = (passport.limits as any)?.allowed_formats || [
    "csv",
    "json",
  ];
  if (context.format && !allowedFormats.includes(context.format)) {
    allow = false;
    reasons.push({
      code: "INVALID_FORMAT",
      message: `Format ${
        context.format
      } is not allowed. Allowed formats: ${allowedFormats.join(", ")}`,
      severity: "error",
    });
  }

  // 5. Check assurance level (L1 minimum) - use existing utility
  const agentAssurance = (passport as any).assurance?.level || "L0";
  if (!meetsMinimumAssurance(agentAssurance, "L1")) {
    allow = false;
    reasons.push({
      code: "INSUFFICIENT_ASSURANCE",
      message: `Required assurance level L1 not met (current: ${agentAssurance})`,
      severity: "error",
    });
  }

  // Validate required context fields
  const { data_types, destination, format } = context;

  if (!data_types || !destination || !format) {
    return {
      decision_id: decisionId,
      allow: false,
      reasons: [
        {
          code: "MISSING_REQUIRED_FIELDS",
          message: "Missing required fields: data_types, destination, format",
          severity: "error",
        },
      ],
      expires_in: 60,
      created_at: new Date().toISOString(),
    };
  }

  // Check data type permissions
  const dataTypesResult = await checkDataTypePermissions(passport, data_types);
  if (!dataTypesResult.allow) {
    allow = false;
    reasons.push(...dataTypesResult.reasons);
  }

  // Check destination restrictions
  const destinationResult = await checkDestinationRestrictions(
    passport,
    destination
  );
  if (!destinationResult.allow) {
    allow = false;
    reasons.push(...destinationResult.reasons);
  }

  // Check format restrictions
  const formatResult = await checkFormatRestrictions(passport, format);
  if (!formatResult.allow) {
    allow = false;
    reasons.push(...formatResult.reasons);
  }

  // Note: Assurance level already checked above (L1 minimum)

  return {
    decision_id: decisionId,
    allow,
    reasons,
    expires_in: 60,
    assurance_level: (passport as any).assurance?.level,
    passport_digest: computePassportDigest(passport),
    created_at: new Date().toISOString(),
  };
}

async function checkDataTypePermissions(
  passport: PassportData,
  dataTypes: string[]
): Promise<{ allow: boolean; reasons: DecisionReason[] }> {
  const reasons: DecisionReason[] = [];

  // Check if agent has data export capability
  if (passport.capabilities) {
    const hasExportCapability = passport.capabilities.some(
      (cap: any) => cap.id === "data.export"
    );

    if (!hasExportCapability) {
      reasons.push({
        code: "INSUFFICIENT_PERMISSIONS",
        message: `Agent does not have data.export capability`,
        severity: "error",
      });
      return { allow: false, reasons };
    }

    // If capability has scope restrictions, check them
    const exportCapability = passport.capabilities.find(
      (cap: any) => cap.id === "data.export"
    );

    if (
      exportCapability?.params &&
      Array.isArray(exportCapability.params.scope)
    ) {
      const hasSpecificPermission = exportCapability.params.scope.some(
        (scope: any) => dataTypes.some((type) => scope.includes(type))
      );

      if (!hasSpecificPermission) {
        reasons.push({
          code: "INSUFFICIENT_PERMISSIONS",
          message: `Agent does not have permission to export data types: ${dataTypes.join(
            ", "
          )}`,
          severity: "error",
        });
        return { allow: false, reasons };
      }
    }
  }

  return { allow: true, reasons };
}

async function checkDestinationRestrictions(
  passport: PassportData,
  destination: string
): Promise<{ allow: boolean; reasons: DecisionReason[] }> {
  const reasons: DecisionReason[] = [];

  // Check if destination is allowed - use passport limits if available, otherwise use defaults
  const allowedDestinations = (passport.limits as any)
    ?.allowed_destinations || ["s3://", "gs://", "local"];

  if (
    !allowedDestinations.some((allowed: string) =>
      destination.startsWith(allowed)
    )
  ) {
    reasons.push({
      code: "DESTINATION_NOT_ALLOWED",
      message: `Destination ${destination} is not allowed. Allowed prefixes: ${allowedDestinations.join(
        ", "
      )}`,
      severity: "error",
    });
    return { allow: false, reasons };
  }

  return { allow: true, reasons };
}

async function checkFormatRestrictions(
  passport: PassportData,
  format: string
): Promise<{ allow: boolean; reasons: DecisionReason[] }> {
  const reasons: DecisionReason[] = [];

  // Check if format is allowed
  const allowedFormats = ["json", "csv", "parquet"];

  if (!allowedFormats.includes(format)) {
    reasons.push({
      code: "FORMAT_NOT_ALLOWED",
      message: `Format ${format} is not allowed`,
      severity: "error",
    });
    return { allow: false, reasons };
  }

  return { allow: true, reasons };
}

function generateDecisionId(): string {
  return `dec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function computePassportDigest(passport: PassportData): string {
  const data = JSON.stringify(passport);
  return btoa(data).substr(0, 16);
}
