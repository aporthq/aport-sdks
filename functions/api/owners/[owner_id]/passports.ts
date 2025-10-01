import { cors } from "../../../utils/cors";
import { createLogger } from "../../../utils/logger";
import { authMiddleware } from "../../../utils/auth-middleware";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";

interface Env {
  ai_passport_registry: KVNamespace;
  JWT_SECRET: string;
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
    // Authenticate user (allow both JWT and API key)
    const authResult = await authMiddleware(request, env as any, {
      requireAuth: true,
      allowApiKey: true,
      requiredApiKeyScopes: ["read"],
    });
    if (!authResult.success) {
      const response = new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json", ...headers },
      });

      await logger.logRequest(request, response, startTime);
      return response;
    }

    const ownerId = params.owner_id as string;
    console.log("Owner ID:", ownerId);

    // Validate owner ID format
    if (!ownerId.startsWith("ap_org_") && !ownerId.startsWith("ap_user_")) {
      const response = new Response(
        JSON.stringify({
          error: "invalid_owner_id",
          message: "Owner ID must start with 'ap_org_' or 'ap_user_'",
        }),
        {
          status: 400,
          headers: { "content-type": "application/json", ...headers },
        }
      );

      await logger.logRequest(request, response, startTime);
      return response;
    }

    // Check if owner exists
    const ownerType = ownerId.startsWith("ap_org_") ? "org" : "user";
    const ownerData = await env.ai_passport_registry.get(
      `${ownerType}:${ownerId}`,
      "json"
    );
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

    // Get owner's passports from index
    const indexKey = `owner_agents:${ownerId}`;
    const indexData = await env.ai_passport_registry.get(indexKey, "json");
    const agentIds = (indexData as string[]) || [];

    // Fetch passport summaries (only active and suspended, no drafts)
    const passports = [];
    for (const agentId of agentIds) {
      try {
        const passportData = await env.ai_passport_registry.get(
          `passport:${agentId}`,
          "json"
        );
        if (passportData) {
          const passport = passportData as any;

          // Include active, suspended, and draft passports (exclude only revoked)
          // if (passport.status === "active" || passport.status === "suspended" || passport.status === "draft") {
          passports.push({
            // Core Identity
            agent_id: passport.agent_id,
            slug: passport.slug,
            name: passport.name,
            owner_id: passport.owner_id,
            owner_type: passport.owner_type,
            owner_display: passport.owner_display,
            controller_type: passport.controller_type,
            claimed: passport.claimed,

            // Agent Details
            role: passport.role,
            description: passport.description,
            capabilities: passport.capabilities || [],
            limits: passport.limits || {},
            regions: passport.regions || [],

            // Status & Verification
            status: passport.status,
            verification_status: passport.verification_status,
            verification_method: passport.verification_method,
            verification_evidence: passport.verification_evidence || {},

            // Assurance
            assurance_level: passport.assurance_level,
            assurance_method: passport.assurance_method,
            assurance_verified_at: passport.assurance_verified_at,

            // Contact & Links
            contact: passport.contact,
            links: passport.links || { homepage: "", docs: "", repo: "" },

            // Categorization & Metadata
            categories:
              passport.categories || passport.controlled_categories || [],
            framework:
              passport.framework || passport.controlled_framework || [],
            logo_url: passport.logo_url,

            // System Metadata
            source: passport.source,
            created_at: passport.created_at,
            updated_at: passport.updated_at,
            version: passport.version,

            // Issuance & Delegation
            issuer_type: passport.issuer_type,
            issued_by: passport.issued_by,
            provisioned_by_org_id: passport.provisioned_by_org_id,
            pending_owner: passport.pending_owner,
            sponsor_orgs: passport.sponsor_orgs || [],

            // Registry Signature
            registry_key_id: passport.registry_key_id,
            registry_sig: passport.registry_sig,
            canonical_hash: passport.canonical_hash,
            verified_at: passport.verified_at,

            // MCP Support
            mcp: passport.mcp,

            // Policy Evaluation
            evaluation: passport.evaluation,

            // Attestations
            attestations: passport.attestations || [],

            // Additional fields
            kind: passport.kind,
            creator_id: passport.creator_id,
            creator_type: passport.creator_type,
          });
          // }
        }
      } catch (error) {
        console.warn(`Failed to fetch passport ${agentId}:`, error);
        // Continue with other passports
      }
    }

    // Sort by updated_at descending
    passports.sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

    const response = new Response(
      JSON.stringify({
        owner_id: ownerId,
        passports,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json", ...headers },
      }
    );

    await logger.logRequest(request, response, startTime);
    return response;
  } catch (error) {
    console.error("Error getting owner passports:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to get owner passports",
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
