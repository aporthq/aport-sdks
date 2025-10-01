import { cors } from "../utils/cors";
import { createLogger } from "../utils/logger";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";
import { PassportData } from "../../types/passport";

interface Env {
  ai_passport_registry: KVNamespace;
  AP_VERSION: string;
}

export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestGet: PagesFunction<Env> = async ({
  request,
  env,
  params,
}) => {
  const startTime = Date.now();
  const logger = createLogger(env.ai_passport_registry);

  try {
    const agentId = params.agent_id as string;
    const url = new URL(request.url);
    const theme = url.searchParams.get("theme") || "light";

    if (!agentId) {
      const response = new Response(
        JSON.stringify({ error: "missing_agent_id" }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Validate theme parameter
    if (!["light", "dark"].includes(theme)) {
      const response = new Response(
        JSON.stringify({
          error: "invalid_theme",
          message: "Theme must be 'light' or 'dark'",
        }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        }
      );

      await logger.logRequest(request, response, startTime, { agentId });
      return response;
    }

    // Get the agent passport
    const key = `passport:${agentId}`;
    const rawPassport = (await env.ai_passport_registry.get(
      key,
      "json"
    )) as PassportData | null;

    if (!rawPassport) {
      const response = new Response(
        generateErrorWidget("Agent not found", theme),
        {
          status: 404,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, max-age=60", // 1 minute cache for errors
            "x-frame-options": "ALLOWALL",
            ...cors(request),
          },
        }
      );

      await logger.logRequest(request, response, startTime, { agentId });
      return response;
    }

    // Generate widget HTML
    const widgetHtml = generateAgentWidget(rawPassport, theme);

    const response = new Response(widgetHtml, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300, s-maxage=300", // 5 minutes cache
        "x-frame-options": "ALLOWALL", // Allow iframe embedding
        "x-agent-passport-version": rawPassport.version || env.AP_VERSION,
        ...cors(request),
      },
    });

    await logger.logRequest(request, response, startTime, { agentId });
    return response;
  } catch (error) {
    console.error("Error generating agent widget:", error);

    const theme = new URL(request.url).searchParams.get("theme") || "light";
    const response = new Response(
      generateErrorWidget("Failed to load agent information", theme),
      {
        status: 500,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "x-frame-options": "ALLOWALL",
        },
      }
    );

    await logger.logRequest(request, response, startTime);
    return response;
  }
};

/**
 * Generate responsive HTML widget for agent card with monochrome design
 */
function generateAgentWidget(passport: PassportData, theme: string): string {
  const isDark = theme === "dark";

  // Monochrome theme-specific colors (only status badges have color)
  const colors = isDark
    ? {
        bg: "#0d1117",
        cardBg: "#161b22",
        text: "#f0f6fc",
        textMuted: "#8b949e",
        border: "#30363d",
        badgeBg: "#21262d",
        shadow: "rgba(0, 0, 0, 0.5)",
      }
    : {
        bg: "#ffffff",
        cardBg: "#ffffff",
        text: "#24292f",
        textMuted: "#656d76",
        border: "#d0d7de",
        badgeBg: "#f6f8fa",
        shadow: "rgba(0, 0, 0, 0.1)",
      };

  // Status colors (only colored elements in the design)
  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "#1a7f37"; // GitHub green
      case "suspended":
        return "#fb8500"; // GitHub orange
      case "revoked":
        return "#cf222e"; // GitHub red
      default:
        return colors.textMuted;
    }
  };

  // Assurance level colors (only colored elements in the design)
  const getAssuranceInfo = (level: string) => {
    const levels: Record<
      string,
      { name: string; icon: string; color: string }
    > = {
      L0: { name: "L0 assurance", icon: "⚠", color: "#cf222e" }, // GitHub red
      L1: { name: "L1 assurance", icon: "✉", color: "#fb8500" }, // GitHub orange
      L2: { name: "L2 assurance", icon: "⚡", color: "#0969da" }, // GitHub blue
      L3: { name: "L3 assurance", icon: "✓", color: "#1a7f37" }, // GitHub green
      L4KYC: { name: "L4K assurance", icon: "◆", color: "#8250df" }, // GitHub purple
      L4FIN: { name: "L4F assurance", icon: "●", color: "#1f883d" }, // GitHub dark green
    };
    return (
      levels[level] || {
        name: "L0 assurance",
        icon: "?",
        color: colors.textMuted,
      }
    );
  };

  const statusColor = getStatusColor(passport.status);
  const assurance = getAssuranceInfo(passport.assurance_level);
  const aboutUrl = `https://aport.io/agents/${passport.agent_id}`;

  // Format capabilities for display
  const capabilitiesDisplay =
    passport.capabilities?.length > 0
      ? passport.capabilities
          .slice(0, 3)
          .map((cap) => cap.id)
          .join(", ") +
        (passport.capabilities.length > 3
          ? ` +${passport.capabilities.length - 3} more`
          : "")
      : "No capabilities listed";

  // Format regions for display
  const regionsDisplay =
    passport.regions?.length > 0
      ? passport.regions.slice(0, 3).join(", ") +
        (passport.regions.length > 3
          ? ` +${passport.regions.length - 3} more`
          : "")
      : "Global";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent ${passport.name} - Passport Widget</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      background-color: ${colors.bg};
      color: ${colors.text};
      font-size: 14px;
      line-height: 1.5;
      padding: 16px;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .widget-container {
      background-color: ${colors.cardBg};
      border: 1px solid ${colors.border};
      border-radius: 8px;
      padding: 24px;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 1px 3px ${colors.shadow};
      transition: box-shadow 0.2s ease;
    }
    
    .widget-container:hover {
      box-shadow: 0 4px 12px ${colors.shadow};
    }
    
    .header {
      display: flex;
      align-items: flex-start;
      margin-bottom: 20px;
      gap: 16px;
    }
    
    .agent-icon {
      width: 56px;
      height: 56px;
      border-radius: 6px;
      background-color: ${colors.badgeBg};
      border: 2px solid ${colors.border};
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: 600;
      color: ${colors.text};
      flex-shrink: 0;
    }
    
    .header-text {
      flex: 1;
      min-width: 0;
    }
    
    .agent-name {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 6px;
      word-break: break-word;
      color: ${colors.text};
    }
    
    .agent-owner {
      color: ${colors.textMuted};
      font-size: 14px;
      word-break: break-word;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
    }
    
    .status-row {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    
    .status-badge {
      display: inline-flex;
      align-items: center;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      gap: 6px;
      border: 1px solid transparent;
    }
    
    .status-badge.status-badge-colored {
      background-color: ${statusColor};
      color: white;
      border-color: ${statusColor};
    }
    
    .assurance-badge {
      background-color: ${assurance.color};
      color: white;
      border-color: ${assurance.color};
    }
    
    .info-grid {
      display: grid;
      gap: 16px;
      margin-bottom: 20px;
    }
    
    .info-item {
      padding: 16px;
      background-color: ${colors.badgeBg};
      border-radius: 6px;
      border: 1px solid ${colors.border};
    }
    
    .info-label {
      font-size: 12px;
      font-weight: 600;
      color: ${colors.textMuted};
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .info-value {
      font-size: 14px;
      word-break: break-word;
      line-height: 1.4;
      color: ${colors.text};
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
    }
    
    .footer {
      text-align: center;
      padding-top: 20px;
      border-top: 1px solid ${colors.border};
    }
    
    .view-full-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: ${colors.textMuted};
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      padding: 10px 16px;
      border-radius: 6px;
      border: 1px solid ${colors.border};
      transition: all 0.15s ease;
      background-color: ${colors.badgeBg};
    }
    
    .view-full-link:hover {
      border-color: ${colors.textMuted};
      color: ${colors.text};
    }
    
    .powered-by {
      margin-top: 16px;
      font-size: 11px;
      color: ${colors.textMuted};
    }
    
    .powered-by a {
      color: ${colors.textMuted};
      text-decoration: none;
    }
    
    .powered-by a:hover {
      text-decoration: underline;
    }
    
    /* Responsive design */
    @media (max-width: 320px) {
      body {
        padding: 12px;
      }
      
      .widget-container {
        padding: 20px;
      }
      
      .agent-name {
        font-size: 18px;
      }
      
      .agent-icon {
        width: 48px;
        height: 48px;
        font-size: 20px;
      }
      
      .header {
        gap: 12px;
      }
    }
    
    @media (max-width: 280px) {
      .status-row {
        flex-direction: column;
      }
      
      .status-badge {
        justify-content: center;
      }
    }
  </style>
</head>
<body>
  <div class="widget-container">
    <div class="header">
      <div class="agent-icon">
        ${passport.name.charAt(0).toUpperCase()}
      </div>
      <div class="header-text">
        <div class="agent-name">${passport.name}</div>
        <div class="agent-owner">${
          passport.owner_display || passport.owner_id || "Unknown Owner"
        }</div>
      </div>
    </div>
    
    <div class="status-row">
      <span class="status-badge status-badge-colored">
        ${passport.status.charAt(0).toUpperCase() + passport.status.slice(1)}
      </span>
      <span class="status-badge assurance-badge">
        ${assurance.icon} ${assurance.name}
      </span>
    </div>
    
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">Role</div>
        <div class="info-value">${passport.role}</div>
      </div>
      
      <div class="info-item">
        <div class="info-label">Capabilities</div>
        <div class="info-value">${capabilitiesDisplay}</div>
      </div>
      
      <div class="info-item">
        <div class="info-label">Regions</div>
        <div class="info-value">${regionsDisplay}</div>
      </div>
      
      ${
        Object.keys(passport.limits || {}).length > 0
          ? `
      <div class="info-item">
        <div class="info-label">Key Limits</div>
        <div class="info-value">${Object.entries(passport.limits || {})
          .slice(0, 2)
          .map(([key, value]) => `${key}: ${value}`)
          .join(", ")}</div>
      </div>
      `
          : ""
      }
    </div>
    
    <div class="footer">
      <a href="${aboutUrl}" target="_blank" class="view-full-link">
        <span>View Full Passport</span>
        <span>↗</span>
      </a>
      
      <div class="powered-by">
        Powered by <a href="https://aport.io" target="_blank">APort</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generate error widget HTML with monochrome design
 */
function generateErrorWidget(message: string, theme: string): string {
  const isDark = theme === "dark";
  const colors = isDark
    ? {
        bg: "#0d1117",
        cardBg: "#161b22",
        text: "#f0f6fc",
        textMuted: "#8b949e",
        border: "#30363d",
        badgeBg: "#21262d",
        shadow: "rgba(0, 0, 0, 0.5)",
      }
    : {
        bg: "#ffffff",
        cardBg: "#ffffff",
        text: "#24292f",
        textMuted: "#656d76",
        border: "#d0d7de",
        badgeBg: "#f6f8fa",
        shadow: "rgba(0, 0, 0, 0.1)",
      };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Passport Widget - Error</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      background-color: ${colors.bg};
      color: ${colors.text};
      font-size: 14px;
      padding: 16px;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .error-container {
      background-color: ${colors.cardBg};
      border: 1px solid ${colors.border};
      border-radius: 8px;
      padding: 32px;
      max-width: 420px;
      width: 100%;
      text-align: center;
      box-shadow: 0 1px 3px ${colors.shadow};
    }
    
    .error-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 20px;
      background-color: ${colors.badgeBg};
      border: 2px solid ${colors.border};
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      color: ${colors.textMuted};
    }
    
    .error-message {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 8px;
      color: ${colors.text};
    }
    
    .error-subtitle {
      color: ${colors.textMuted};
      font-size: 14px;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <div class="error-container">
    <div class="error-icon">!</div>
    <div class="error-message">${message}</div>
    <div class="error-subtitle">Please check the agent ID and try again</div>
  </div>
</body>
</html>`;
}
