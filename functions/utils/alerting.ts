import { KVNamespace } from "@cloudflare/workers-types";

export interface AlertRule {
  id: string;
  name: string;
  condition: string;
  threshold: number;
  operator: "gt" | "lt" | "eq" | "gte" | "lte";
  metric_type: string;
  enabled: boolean;
  cooldown_minutes: number;
  last_triggered?: string;
}

export interface Alert {
  id: string;
  rule_id: string;
  triggered_at: string;
  resolved_at?: string;
  status: "active" | "resolved";
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  metric_value: number;
  threshold: number;
  metadata?: Record<string, unknown>;
}

export interface AlertConfig {
  webhook_url?: string;
  email_recipients?: string[];
  slack_webhook?: string;
  enabled: boolean;
}

const DEFAULT_ALERT_RULES: AlertRule[] = [
  {
    id: "p95_latency_high",
    name: "P95 Latency High",
    condition: "p95_latency",
    threshold: 80,
    operator: "gt",
    metric_type: "verify_latency",
    enabled: true,
    cooldown_minutes: 5,
  },
  {
    id: "error_rate_high",
    name: "Error Rate High",
    condition: "error_rate",
    threshold: 0.1,
    operator: "gt",
    metric_type: "verify_error",
    enabled: true,
    cooldown_minutes: 5,
  },
  {
    id: "availability_low",
    name: "Availability Low",
    condition: "availability",
    threshold: 99.9,
    operator: "lt",
    metric_type: "verify_success",
    enabled: true,
    cooldown_minutes: 10,
  },
  {
    id: "consecutive_failures",
    name: "Consecutive Failures",
    condition: "consecutive_failures",
    threshold: 3,
    operator: "gte",
    metric_type: "verify_error",
    enabled: true,
    cooldown_minutes: 2,
  },
];

/**
 * Store an alert in KV
 */
export async function storeAlert(kv: KVNamespace, alert: Alert): Promise<void> {
  const key = `alert:${alert.id}`;
  await kv.put(key, JSON.stringify(alert), {
    expirationTtl: 7 * 24 * 60 * 60, // 7 days
  });
}

/**
 * Get active alerts
 */
export async function getActiveAlerts(kv: KVNamespace): Promise<Alert[]> {
  // This is a simplified implementation
  // In production, you'd want to maintain an index of active alerts
  const alerts: Alert[] = [];

  // For now, we'll return empty array as we don't have efficient querying in KV
  // In production, you'd implement proper alert indexing
  return alerts;
}

/**
 * Get alert rules
 */
export async function getAlertRules(kv: KVNamespace): Promise<AlertRule[]> {
  const rulesData = await kv.get("alert_rules", "json");
  return (rulesData as AlertRule[]) || DEFAULT_ALERT_RULES;
}

/**
 * Update alert rules
 */
export async function updateAlertRules(
  kv: KVNamespace,
  rules: AlertRule[]
): Promise<void> {
  await kv.put("alert_rules", JSON.stringify(rules));
}

/**
 * Check if an alert rule should trigger
 */
export function shouldTriggerAlert(
  rule: AlertRule,
  metricValue: number,
  lastTriggered?: string
): boolean {
  if (!rule.enabled) {
    return false;
  }

  // Check cooldown period
  if (lastTriggered) {
    const lastTriggeredTime = new Date(lastTriggered).getTime();
    const cooldownMs = rule.cooldown_minutes * 60 * 1000;
    const now = Date.now();

    if (now - lastTriggeredTime < cooldownMs) {
      return false;
    }
  }

  // Check threshold condition
  switch (rule.operator) {
    case "gt":
      return metricValue > rule.threshold;
    case "lt":
      return metricValue < rule.threshold;
    case "eq":
      return metricValue === rule.threshold;
    case "gte":
      return metricValue >= rule.threshold;
    case "lte":
      return metricValue <= rule.threshold;
    default:
      return false;
  }
}

/**
 * Create an alert from a rule
 */
export function createAlert(
  rule: AlertRule,
  metricValue: number,
  metadata?: Record<string, unknown>
): Alert {
  const alertId = `${rule.id}_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;

  return {
    id: alertId,
    rule_id: rule.id,
    triggered_at: new Date().toISOString(),
    status: "active",
    severity: getSeverity(rule, metricValue),
    message: generateAlertMessage(rule, metricValue),
    metric_value: metricValue,
    threshold: rule.threshold,
    metadata,
  };
}

/**
 * Determine alert severity based on rule and value
 */
function getSeverity(rule: AlertRule, metricValue: number): Alert["severity"] {
  const ratio = metricValue / rule.threshold;

  if (ratio >= 2) return "critical";
  if (ratio >= 1.5) return "high";
  if (ratio >= 1.2) return "medium";
  return "low";
}

/**
 * Generate human-readable alert message
 */
function generateAlertMessage(rule: AlertRule, metricValue: number): string {
  const operatorText = {
    gt: "exceeded",
    lt: "dropped below",
    eq: "equals",
    gte: "reached or exceeded",
    lte: "reached or dropped below",
  }[rule.operator];

  return `${rule.name}: ${metricValue} ${operatorText} threshold of ${rule.threshold}`;
}

/**
 * Check metrics against alert rules and trigger alerts
 */
export async function checkAndTriggerAlerts(
  kv: KVNamespace,
  metrics: {
    p95_latency: number;
    error_rate: number;
    availability: number;
    consecutive_failures?: number;
  }
): Promise<Alert[]> {
  const rules = await getAlertRules(kv);
  const triggeredAlerts: Alert[] = [];

  for (const rule of rules) {
    let metricValue: number;

    switch (rule.condition) {
      case "p95_latency":
        metricValue = metrics.p95_latency;
        break;
      case "error_rate":
        metricValue = metrics.error_rate;
        break;
      case "availability":
        metricValue = metrics.availability;
        break;
      case "consecutive_failures":
        metricValue = metrics.consecutive_failures || 0;
        break;
      default:
        continue;
    }

    if (shouldTriggerAlert(rule, metricValue, rule.last_triggered)) {
      const alert = createAlert(rule, metricValue, {
        rule_name: rule.name,
        condition: rule.condition,
      });

      triggeredAlerts.push(alert);
      await storeAlert(kv, alert);

      // Update rule's last triggered time
      rule.last_triggered = alert.triggered_at;
    }
  }

  // Update rules with new last_triggered times
  if (triggeredAlerts.length > 0) {
    await updateAlertRules(kv, rules);
  }

  return triggeredAlerts;
}

/**
 * Resolve an alert
 */
export async function resolveAlert(
  kv: KVNamespace,
  alertId: string
): Promise<boolean> {
  const alertData = await kv.get(`alert:${alertId}`, "json");
  if (!alertData) {
    return false;
  }

  const alert = alertData as Alert;
  alert.status = "resolved";
  alert.resolved_at = new Date().toISOString();

  await kv.put(`alert:${alertId}`, JSON.stringify(alert));
  return true;
}

/**
 * Get alert configuration
 */
export async function getAlertConfig(kv: KVNamespace): Promise<AlertConfig> {
  const configData = await kv.get("alert_config", "json");
  return (
    (configData as AlertConfig) || {
      enabled: true,
    }
  );
}

/**
 * Update alert configuration
 */
export async function updateAlertConfig(
  kv: KVNamespace,
  config: AlertConfig
): Promise<void> {
  await kv.put("alert_config", JSON.stringify(config));
}
