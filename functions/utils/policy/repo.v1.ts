/**
 * Repository Policy Evaluator
 *
 * Evaluates repository operations against the repo.v1 policy pack.
 */

import { PassportData } from "../../../types/passport";
import { Decision, DecisionReason } from "../../../shared/types/decision";
import { Env } from "../types";
import { meetsMinimumAssurance } from "../assurance";

export async function evaluateRepoV1(
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

  // 1. Check capabilities (repo.pr.create, repo.merge)
  const agentCapabilities = passport.capabilities || [];
  const requiredCapabilities = ["repo.pr.create", "repo.merge"];

  for (const capability of requiredCapabilities) {
    const hasCapability = agentCapabilities.some(
      (cap: any) => (typeof cap === "string" ? cap : cap.id) === capability
    );

    if (!hasCapability) {
      allow = false;
      reasons.push({
        code: "INSUFFICIENT_CAPABILITIES",
        message: `Missing required capability: ${capability}`,
        severity: "error",
      });
    }
  }

  // 2. Check PR limits (max PRs per day)
  const maxPRsPerDay = passport.limits?.max_prs_per_day ?? 5;
  const today = new Date().toISOString().substring(0, 10);
  const prKey = `prs:${passport.agent_id}:${today}`;

  const prCount = await getCurrentCount(env, prKey);
  if (context.operation === "create_pr" && prCount >= maxPRsPerDay) {
    allow = false;
    reasons.push({
      code: "PR_LIMIT_EXCEEDED",
      message: `Daily PR limit exceeded: ${prCount}/${maxPRsPerDay}`,
      severity: "error",
    });
  } else if (context.operation === "create_pr" && maxPRsPerDay > 0) {
    await incrementCount(env, prKey, 86400);
  }

  // 3. Check merge limits (max merges per day)
  const maxMergesPerDay = passport.limits?.max_merges_per_day ?? 10;
  const mergeKey = `merges:${passport.agent_id}:${today}`;

  const mergeCount = await getCurrentCount(env, mergeKey);
  if (context.operation === "merge" && mergeCount >= maxMergesPerDay) {
    allow = false;
    reasons.push({
      code: "MERGE_LIMIT_EXCEEDED",
      message: `Daily merge limit exceeded: ${mergeCount}/${maxMergesPerDay}`,
      severity: "error",
    });
  } else if (context.operation === "merge") {
    await incrementCount(env, mergeKey, 86400);
  }

  // 4. Check PR size limits
  const maxPRSizeKB = passport.limits?.max_pr_size_kb ?? 1000;
  if (context.pr_size_kb && context.pr_size_kb > maxPRSizeKB) {
    allow = false;
    reasons.push({
      code: "PR_SIZE_LIMIT_EXCEEDED",
      message: `PR size ${context.pr_size_kb}KB exceeds limit of ${maxPRSizeKB}KB`,
      severity: "error",
    });
  }

  // 5. Check repository allowlist
  const allowedRepos = passport.limits?.allowed_repos || [];
  if (
    context.repository &&
    allowedRepos.length > 0 &&
    !allowedRepos.includes(context.repository)
  ) {
    allow = false;
    reasons.push({
      code: "REPOSITORY_NOT_ALLOWED",
      message: `Repository ${context.repository} is not allowed`,
      severity: "error",
    });
  }

  // 6. Check base branch allowlist
  const allowedBranches = passport.limits?.allowed_base_branches || [
    "main",
    "master",
  ];
  if (context.base_branch && !allowedBranches.includes(context.base_branch)) {
    allow = false;
    reasons.push({
      code: "BASE_BRANCH_NOT_ALLOWED",
      message: `Base branch ${context.base_branch} is not allowed`,
      severity: "error",
    });
  }

  // 7. Check path allowlist
  const allowedPaths = passport.limits?.allowed_paths || [];
  if (context.file_paths && allowedPaths.length > 0) {
    const invalidPaths = context.file_paths.filter(
      (path: string) =>
        !allowedPaths.some((allowedPath: string) =>
          path.startsWith(allowedPath)
        )
    );

    if (invalidPaths.length > 0) {
      allow = false;
      reasons.push({
        code: "PATH_NOT_ALLOWED",
        message: `File paths not allowed: ${invalidPaths.join(", ")}`,
        severity: "error",
      });
    }
  }

  // 8. Check GitHub actor enforcement
  if (context.github_actor && !context.github_actor.startsWith("agent-")) {
    allow = false;
    reasons.push({
      code: "INVALID_GITHUB_ACTOR",
      message: "GitHub actor must be an agent",
      severity: "error",
    });
  }

  // 9. Check assurance level (L2 minimum) - use existing utility
  const agentAssurance = (passport as any).assurance?.level || "L0";
  if (!meetsMinimumAssurance(agentAssurance, "L2")) {
    allow = false;
    reasons.push({
      code: "INSUFFICIENT_ASSURANCE",
      message: `Required assurance level L2 not met (current: ${agentAssurance})`,
      severity: "error",
    });
  }

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

async function getCurrentCount(env: Env, key: string): Promise<number> {
  const count = await env.ai_passport_registry.get(key);
  return count ? parseInt(count) : 0;
}

async function incrementCount(
  env: Env,
  key: string,
  ttl: number
): Promise<void> {
  const current = await getCurrentCount(env, key);
  await env.ai_passport_registry.put(key, (current + 1).toString(), {
    expirationTtl: ttl,
  });
}

function generateDecisionId(): string {
  return `dec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function computePassportDigest(passport: PassportData): string {
  const data = JSON.stringify(passport);
  return btoa(data).substr(0, 16);
}
