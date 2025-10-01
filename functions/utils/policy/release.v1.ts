/**
 * Release Policy Evaluator
 *
 * Evaluates release requests against the release.v1 policy pack.
 */

import { PassportData } from "../../../types/passport";
import { Decision, DecisionReason } from "../../../shared/types/decision";
import { Env } from "../types";

export async function evaluateReleaseV1(
  env: Env,
  passport: PassportData,
  context: Record<string, any>,
  idempotencyKey?: string
): Promise<Decision> {
  const decisionId = generateDecisionId();
  const reasons: DecisionReason[] = [];
  let allow = true;

  // Validate required context fields
  const { repository, version, files } = context;

  if (!repository || !version || !files) {
    return {
      decision_id: decisionId,
      allow: false,
      reasons: [
        {
          code: "oap.missing_required_fields",
          message: "Missing required fields: repository, version, files",
          severity: "error",
        },
      ],
      expires_in: 60,
      created_at: new Date().toISOString(),
    };
  }

  // Check repository permissions
  const repoResult = await checkRepositoryPermissions(passport, repository);
  if (!repoResult.allow) {
    allow = false;
    reasons.push(...repoResult.reasons);
  }

  // Check version format
  const versionResult = await checkVersionFormat(version);
  if (!versionResult.allow) {
    allow = false;
    reasons.push(...versionResult.reasons);
  }

  // Check file restrictions
  const filesResult = await checkFileRestrictions(passport, files);
  if (!filesResult.allow) {
    allow = false;
    reasons.push(...filesResult.reasons);
  }

  // Check assurance level
  const assuranceResult = await checkAssuranceLevel(passport, "L3");
  if (!assuranceResult.allow) {
    allow = false;
    reasons.push(...assuranceResult.reasons);
  }

  return {
    decision_id: decisionId,
    allow,
    reasons,
    expires_in: 60,
    assurance_level: passport.assurance_level,
    passport_digest: computePassportDigest(passport),
    created_at: new Date().toISOString(),
  };
}

async function checkRepositoryPermissions(
  passport: PassportData,
  repository: string
): Promise<{ allow: boolean; reasons: DecisionReason[] }> {
  const reasons: DecisionReason[] = [];

  // Check if agent has permission to release to this repository
  if (passport.capabilities) {
    const hasReleaseCapability = passport.capabilities.some(
      (cap) =>
        cap.id === "release" &&
        (cap.params?.scope as string)?.includes(repository)
    );

    if (!hasReleaseCapability) {
      reasons.push({
        code: "oap.unknown_capability",
        message: `Agent does not have release permission for repository ${repository}`,
        severity: "error",
      });
      return { allow: false, reasons };
    }
  }

  return { allow: true, reasons };
}

async function checkVersionFormat(
  version: string
): Promise<{ allow: boolean; reasons: DecisionReason[] }> {
  const reasons: DecisionReason[] = [];

  // Check if version follows semantic versioning
  const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;

  if (!semverRegex.test(version)) {
    reasons.push({
      code: "oap.format_unsupported",
      message: `Version ${version} does not follow semantic versioning`,
      severity: "error",
    });
    return { allow: false, reasons };
  }

  return { allow: true, reasons };
}

async function checkFileRestrictions(
  passport: PassportData,
  files: string[]
): Promise<{ allow: boolean; reasons: DecisionReason[] }> {
  const reasons: DecisionReason[] = [];

  // Check if files are allowed
  const allowedExtensions = [".js", ".ts", ".json", ".md", ".txt"];
  const restrictedFiles = files.filter((file) => {
    const ext = file.substring(file.lastIndexOf("."));
    return !allowedExtensions.includes(ext);
  });

  if (restrictedFiles.length > 0) {
    reasons.push({
      code: "oap.file_forbidden",
      message: `Files with restricted extensions: ${restrictedFiles.join(
        ", "
      )}`,
      severity: "error",
    });
    return { allow: false, reasons };
  }

  return { allow: true, reasons };
}

async function checkAssuranceLevel(
  passport: PassportData,
  requiredLevel: string
): Promise<{ allow: boolean; reasons: DecisionReason[] }> {
  const reasons: DecisionReason[] = [];

  if (!passport.assurance_level || passport.assurance_level !== requiredLevel) {
    reasons.push({
      code: "oap.assurance_insufficient",
      message: `Required assurance level ${requiredLevel} not met`,
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
