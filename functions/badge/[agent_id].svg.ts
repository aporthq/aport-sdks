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
    // Extract agent_id from params (remove .svg extension if present)
    const agentIdParam = params.agent_id as string;
    const agentId = agentIdParam?.replace(/\.svg$/, "");

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

    // Get the agent passport
    const key = `passport:${agentId}`;
    const rawPassport = (await env.ai_passport_registry.get(
      key,
      "json"
    )) as PassportData | null;

    if (!rawPassport) {
      const response = new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });

      await logger.logRequest(request, response, startTime, { agentId });
      return response;
    }

    // Generate SVG badge
    const badgeSvg = generateGitHubStyleBadge(rawPassport);

    const response = new Response(badgeSvg, {
      status: 200,
      headers: {
        "content-type": "image/svg+xml",
        "cache-control": "public, max-age=300, s-maxage=300", // 5 minutes cache
        "x-agent-passport-version": rawPassport.version || env.AP_VERSION,
        ...cors(request),
      },
    });

    await logger.logRequest(request, response, startTime, { agentId });
    return response;
  } catch (error) {
    console.error("Error generating badge SVG:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to generate badge SVG",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );

    await logger.logRequest(request, response, startTime);
    return response;
  }
};

/**
 * Generate GitHub-style SVG badge with status, verification, and assurance level
 */
function generateGitHubStyleBadge(passport: PassportData): string {
  const { status, verification_status, assurance_level } = passport;

  // Status badge configuration
  let statusColor: string;
  let statusText: string;

  switch (status) {
    case "active":
      statusColor = "#1a7f37"; // GitHub green
      statusText = "active";
      break;
    case "suspended":
      statusColor = "#fb8500"; // GitHub orange
      statusText = "suspended";
      break;
    case "revoked":
      statusColor = "#cf222e"; // GitHub red
      statusText = "revoked";
      break;
    default:
      statusColor = "#656d76"; // GitHub gray
      statusText = "draft";
  }

  // Verification badge configuration
  let verificationColor: string;
  let verificationText: string;

  switch (verification_status) {
    case "email_verified":
      verificationColor = "#0969da"; // GitHub blue
      verificationText = "email verified";
      break;
    case "github_verified":
      verificationColor = "#8250df"; // GitHub purple
      verificationText = "github verified";
      break;
    default:
      verificationColor = "#656d76"; // GitHub gray
      verificationText = "unclaimed";
  }

  // Assurance level badge configuration
  let assuranceColor: string;
  let assuranceText: string;

  switch (assurance_level) {
    case "L0":
      assuranceColor = "#cf222e"; // GitHub red
      assuranceText = "L0 assurance";
      break;
    case "L1":
      assuranceColor = "#fb8500"; // GitHub orange
      assuranceText = "L1 assurance";
      break;
    case "L2":
      assuranceColor = "#0969da"; // GitHub blue
      assuranceText = "L2 assurance";
      break;
    case "L3":
      assuranceColor = "#1a7f37"; // GitHub green
      assuranceText = "L3 assurance";
      break;
    case "L4KYC":
      assuranceColor = "#8250df"; // GitHub purple
      assuranceText = "L4K assurance";
      break;
    case "L4FIN":
      assuranceColor = "#1f883d"; // GitHub dark green
      assuranceText = "L4F assurance";
      break;
    default:
      assuranceColor = "#656d76"; // GitHub gray
      assuranceText = "L0 assurance";
  }

  // Calculate dimensions - GitHub style with more padding
  const fontSize = 11;
  const height = 28; // Taller like GitHub badges
  const padding = 12;

  // Calculate text widths more accurately for responsive design
  const getTextWidth = (text: string) =>
    Math.max(text.length * 6.8, 50) + padding * 2;

  const statusWidth = getTextWidth(statusText);
  const verificationWidth = getTextWidth(verificationText);
  const assuranceWidth = getTextWidth(assuranceText);

  const totalWidth = statusWidth + verificationWidth + assuranceWidth;

  // Agent Passport page URL - use the web interface instead of API
  const aboutUrl = `https://aport.io/agents/${passport.agent_id}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" 
       viewBox="0 0 ${totalWidth} ${height}" 
       width="${totalWidth}" 
       height="${height}"
       style="max-width: 100%; height: auto;"
       role="img" 
       aria-label="Agent Passport Badge">
  <defs>
    <style>
      .badge-text { 
        font: ${fontSize}px -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; 
        text-anchor: middle; 
        dominant-baseline: central;
        fill: #ffffff;
        font-weight: 500;
      }
    </style>
  </defs>
  
  <!-- Status section -->
  <rect x="0" y="0" width="${statusWidth}" height="${height}" fill="${statusColor}"/>
  <text x="${statusWidth / 2}" y="${
    height / 2
  }" class="badge-text">${statusText}</text>
  
  <!-- Verification section -->
  <rect x="${statusWidth}" y="0" width="${verificationWidth}" height="${height}" fill="${verificationColor}"/>
  <text x="${statusWidth + verificationWidth / 2}" y="${
    height / 2
  }" class="badge-text">${verificationText}</text>
  
  <!-- Assurance section -->
  <rect x="${
    statusWidth + verificationWidth
  }" y="0" width="${assuranceWidth}" height="${height}" fill="${assuranceColor}"/>
  <text x="${statusWidth + verificationWidth + assuranceWidth / 2}" y="${
    height / 2
  }" class="badge-text">${assuranceText}</text>
  
  <!-- Clickable link overlay -->
  <a href="${aboutUrl}" target="_blank">
    <rect x="0" y="0" width="${totalWidth}" height="${height}" fill="transparent" cursor="pointer"/>
    <title>Agent ${
      passport.name
    } - ${statusText} | ${verificationText} | ${assuranceText}</title>
  </a>
</svg>`;
}
