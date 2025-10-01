import { PagesFunction } from "@cloudflare/workers-types";
import { cors } from "../../../utils/cors";
import { createLogger } from "../../../utils/logger";
import { getOrgAuditTrails } from "../../../utils/audit-trail";

interface Env {
  ai_passport_registry: KVNamespace;
}

export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestGet: PagesFunction<Env> = async ({
  request,
  env,
  params,
}) => {
  const startTime = Date.now();
  const headers = cors(request);
  const logger = createLogger(env.ai_passport_registry);

  try {
    const ownerId = params.owner_id as string;
    const url = new URL(request.url);
    const format = url.searchParams.get("format") || "json";

    // Handle legacy owner IDs and validate format
    let normalizedOwnerId = ownerId;
    let ownerType: "org" | "user";

    if (ownerId.startsWith("ap_org_")) {
      ownerType = "org";
    } else if (ownerId.startsWith("ap_user_")) {
      ownerType = "user";
    } else {
      // Legacy format - assume it's a user ID
      ownerType = "user";
      normalizedOwnerId = `ap_user_${ownerId}`;
    }

    // Check if owner exists (try both normalized and original formats)
    let ownerData = await env.ai_passport_registry.get(
      `${ownerType}:${normalizedOwnerId}`,
      "json"
    );

    // If not found with normalized format, try original format for legacy support
    if (!ownerData && !ownerId.startsWith("ap_")) {
      ownerData = await env.ai_passport_registry.get(
        `${ownerType}:${ownerId}`,
        "json"
      );
      if (ownerData) {
        normalizedOwnerId = ownerId; // Use original format if found
      }
    }
    if (!ownerData) {
      const response = new Response(
        JSON.stringify({
          error: "owner_not_found",
          message: "Owner not found",
        }),
        {
          status: 404,
          headers: { "content-type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Get Verifiable Attestation for all owner's agents (use original ownerId for index lookup)
    const auditTrails = await getOrgAuditTrails(
      env.ai_passport_registry,
      ownerId
    );

    if (format === "csv") {
      // Generate CSV format
      const csvContent = generateAuditTrailsCSV(ownerId, auditTrails);

      const response = new Response(csvContent, {
        status: 200,
        headers: {
          "content-type": "text/csv",
          "content-disposition": `attachment; filename="audit-trails-${ownerId}-${
            new Date().toISOString().split("T")[0]
          }.csv"`,
          ...headers,
        },
      });

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Default JSON format
    const response = new Response(
      JSON.stringify({
        owner_id: ownerId,
        audit_trails: auditTrails,
        generated_at: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { "content-type": "application/json", ...headers },
      }
    );

    await logger.logRequest(request, response, startTime);
    return response;
  } catch (error) {
    console.error("Error getting owner Verifiable Attestation:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to get Verifiable Attestation",
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

/**
 * Generate CSV content for Verifiable Attestation
 */
function generateAuditTrailsCSV(
  ownerId: string,
  auditTrails: Record<string, any>
): string {
  const headers = [
    "owner_id",
    "agent_id",
    "action_id",
    "action_type",
    "timestamp",
    "actor",
    "changes_summary",
    "action_hash",
    "prev_hash",
    "registry_sig",
    "reason",
  ];

  const rows: string[] = [headers.join(",")];

  for (const [agentId, trail] of Object.entries(auditTrails)) {
    for (const action of trail.actions || []) {
      const changesSummary = Object.keys(action.changes || {}).join("; ");

      const row = [
        ownerId,
        agentId,
        action.id,
        action.type,
        action.timestamp,
        action.actor,
        `"${changesSummary}"`, // Quoted to handle commas in changes
        action.action_hash,
        action.prev_hash || "",
        action.registry_sig || "",
        `"${action.reason || ""}"`, // Quoted to handle commas in reason
      ];

      rows.push(row.join(","));
    }
  }

  return rows.join("\n");
}
