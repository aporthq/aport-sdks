/**
 * Messaging Policy Evaluator
 *
 * Evaluates messaging requests against the messaging.v1 policy pack.
 */

import { PassportData } from "../../../types/passport";
import { Decision, DecisionReason } from "../../../shared/types/decision";
import { Env } from "../types";
import { meetsMinimumAssurance } from "../assurance";

export async function evaluateMessagingV1(
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

  // 1. Check capabilities (messaging.send)
  const agentCapabilities = passport.capabilities || [];
  const hasMessagingCapability = agentCapabilities.some(
    (cap: any) => (typeof cap === "string" ? cap : cap.id) === "messaging.send"
  );

  if (!hasMessagingCapability) {
    allow = false;
    reasons.push({
      code: "INSUFFICIENT_CAPABILITIES",
      message: "Missing required capability: messaging.send",
      severity: "error",
    });
  }

  // 2. Check rate limits (messages per minute)
  const msgsPerMin = passport.limits?.msgs_per_min || 10;
  const currentMinute = new Date().toISOString().substring(0, 16); // YYYY-MM-DDTHH:MM
  const minuteKey = `msgs:${passport.agent_id}:${currentMinute}`;

  const currentCount = await getCurrentCount(env, minuteKey);
  if (currentCount >= msgsPerMin) {
    allow = false;
    reasons.push({
      code: "RATE_LIMIT_EXCEEDED",
      message: `Message rate limit exceeded: ${currentCount}/${msgsPerMin} per minute`,
      severity: "error",
    });
  } else {
    await incrementCount(env, minuteKey, 60); // 60 second TTL
  }

  // 3. Check daily limits (messages per day)
  const msgsPerDay = passport.limits?.msgs_per_day || 1000;
  const today = new Date().toISOString().substring(0, 10); // YYYY-MM-DD
  const dailyKey = `msgs:${passport.agent_id}:${today}`;

  const dailyCount = await getCurrentCount(env, dailyKey);
  if (dailyCount >= msgsPerDay) {
    allow = false;
    reasons.push({
      code: "DAILY_LIMIT_EXCEEDED",
      message: `Daily message limit exceeded: ${dailyCount}/${msgsPerDay}`,
      severity: "error",
    });
  } else {
    await incrementCount(env, dailyKey, 86400); // 24 hour TTL
  }

  // 4. Check channel allowlist
  const allowedChannels = (passport.limits as any)?.allowed_channels || [];
  if (
    context.channel &&
    allowedChannels.length > 0 &&
    !allowedChannels.includes(context.channel)
  ) {
    allow = false;
    reasons.push({
      code: "CHANNEL_NOT_ALLOWED",
      message: `Channel ${context.channel} is not allowed`,
      severity: "error",
    });
  }

  // 5. Check mention policy
  if (context.mentions && context.mentions.includes("@everyone")) {
    const allowEveryone =
      (passport.limits as any)?.allow_everyone_mentions || false;
    if (!allowEveryone) {
      allow = false;
      reasons.push({
        code: "EVERYONE_MENTION_DENIED",
        message: "@everyone mentions are not allowed",
        severity: "error",
      });
    }
  }

  // 6. Check assurance level (L1 minimum) - use existing utility
  const agentAssurance = (passport as any).assurance?.level || "L0";
  if (!meetsMinimumAssurance(agentAssurance, "L1")) {
    allow = false;
    reasons.push({
      code: "INSUFFICIENT_ASSURANCE",
      message: `Required assurance level L1 not met (current: ${agentAssurance})`,
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
