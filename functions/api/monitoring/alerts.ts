import { cors } from "../../utils/cors";
import { createLogger } from "../../utils/logger";
import {
  getActiveAlerts,
  getAlertRules,
  updateAlertRules,
  resolveAlert,
  getAlertConfig,
  updateAlertConfig,
  checkAndTriggerAlerts,
} from "../../utils/alerting";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";

interface Env {
  ai_passport_registry: KVNamespace;
  AP_VERSION: string;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Alert:
 *       type: object
 *       required:
 *         - id
 *         - rule_id
 *         - triggered_at
 *         - status
 *         - severity
 *         - message
 *         - metric_value
 *         - threshold
 *       properties:
 *         id:
 *           type: string
 *           example: "p95_latency_high_1640995200000_abc123"
 *         rule_id:
 *           type: string
 *           example: "p95_latency_high"
 *         triggered_at:
 *           type: string
 *           format: date-time
 *           example: "2024-01-15T10:30:00Z"
 *         resolved_at:
 *           type: string
 *           format: date-time
 *           example: "2024-01-15T10:35:00Z"
 *         status:
 *           type: string
 *           enum: [active, resolved]
 *           example: "active"
 *         severity:
 *           type: string
 *           enum: [low, medium, high, critical]
 *           example: "high"
 *         message:
 *           type: string
 *           example: "P95 Latency High: 95 exceeded threshold of 80"
 *         metric_value:
 *           type: number
 *           example: 95
 *         threshold:
 *           type: number
 *           example: 80
 *         metadata:
 *           type: object
 *           additionalProperties: true
 *     AlertRule:
 *       type: object
 *       required:
 *         - id
 *         - name
 *         - condition
 *         - threshold
 *         - operator
 *         - metric_type
 *         - enabled
 *         - cooldown_minutes
 *       properties:
 *         id:
 *           type: string
 *           example: "p95_latency_high"
 *         name:
 *           type: string
 *           example: "P95 Latency High"
 *         condition:
 *           type: string
 *           example: "p95_latency"
 *         threshold:
 *           type: number
 *           example: 80
 *         operator:
 *           type: string
 *           enum: [gt, lt, eq, gte, lte]
 *           example: "gt"
 *         metric_type:
 *           type: string
 *           example: "verify_latency"
 *         enabled:
 *           type: boolean
 *           example: true
 *         cooldown_minutes:
 *           type: number
 *           example: 5
 *         last_triggered:
 *           type: string
 *           format: date-time
 *           example: "2024-01-15T10:30:00Z"
 */

export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const startTime = Date.now();
  const headers = cors(request);
  const logger = createLogger(env.ai_passport_registry);

  try {
    const url = new URL(request.url);
    const type = url.searchParams.get("type") || "alerts";

    if (type === "rules") {
      const rules = await getAlertRules(env.ai_passport_registry);
      const response = new Response(
        JSON.stringify({
          ok: true,
          rules,
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            ...headers,
          },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    if (type === "config") {
      const config = await getAlertConfig(env.ai_passport_registry);
      const response = new Response(
        JSON.stringify({
          ok: true,
          config,
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            ...headers,
          },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Default: get active alerts
    const alerts = await getActiveAlerts(env.ai_passport_registry);
    const response = new Response(
      JSON.stringify({
        ok: true,
        alerts,
        count: alerts.length,
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          ...headers,
        },
      }
    );

    await logger.logRequest(request, response, startTime);
    return response;
  } catch (error) {
    console.error("Error fetching alerts:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to fetch alerts",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json", ...headers },
      }
    );

    await logger.logRequest(request, response, startTime);
    return response;
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const startTime = Date.now();
  const headers = cors(request);
  const logger = createLogger(env.ai_passport_registry);

  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action === "resolve") {
      const body = (await request.json()) as { alert_id: string };

      if (!body.alert_id) {
        const response = new Response(
          JSON.stringify({ error: "missing_alert_id" }),
          {
            status: 400,
            headers: { "content-type": "application/json", ...headers },
          }
        );

        await logger.logRequest(request, response, startTime);
        return response;
      }

      const resolved = await resolveAlert(
        env.ai_passport_registry,
        body.alert_id
      );

      const response = new Response(
        JSON.stringify({
          ok: resolved,
          message: resolved ? "Alert resolved" : "Alert not found",
        }),
        {
          status: resolved ? 200 : 404,
          headers: {
            "content-type": "application/json",
            ...headers,
          },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    if (action === "update_rules") {
      const body = (await request.json()) as { rules: any[] };

      if (!body.rules || !Array.isArray(body.rules)) {
        const response = new Response(
          JSON.stringify({ error: "invalid_rules" }),
          {
            status: 400,
            headers: { "content-type": "application/json", ...headers },
          }
        );

        await logger.logRequest(request, response, startTime);
        return response;
      }

      await updateAlertRules(env.ai_passport_registry, body.rules);

      const response = new Response(
        JSON.stringify({
          ok: true,
          message: "Alert rules updated",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            ...headers,
          },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    if (action === "update_config") {
      const body = (await request.json()) as { config: any };

      if (!body.config) {
        const response = new Response(
          JSON.stringify({ error: "invalid_config" }),
          {
            status: 400,
            headers: { "content-type": "application/json", ...headers },
          }
        );

        await logger.logRequest(request, response, startTime);
        return response;
      }

      await updateAlertConfig(env.ai_passport_registry, body.config);

      const response = new Response(
        JSON.stringify({
          ok: true,
          message: "Alert configuration updated",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            ...headers,
          },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    if (action === "check") {
      const body = (await request.json()) as {
        p95_latency: number;
        error_rate: number;
        availability: number;
        consecutive_failures?: number;
      };

      const triggeredAlerts = await checkAndTriggerAlerts(
        env.ai_passport_registry,
        body
      );

      const response = new Response(
        JSON.stringify({
          ok: true,
          triggered_alerts: triggeredAlerts,
          count: triggeredAlerts.length,
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            ...headers,
          },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    const response = new Response(JSON.stringify({ error: "invalid_action" }), {
      status: 400,
      headers: { "content-type": "application/json", ...headers },
    });

    await logger.logRequest(request, response, startTime);
    return response;
  } catch (error) {
    console.error("Error processing alert request:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to process alert request",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json", ...headers },
      }
    );

    await logger.logRequest(request, response, startTime);
    return response;
  }
};
