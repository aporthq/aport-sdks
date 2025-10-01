import { PagesFunction } from "@cloudflare/workers-types";
import { cors } from "../../../utils/cors";
import { getOrganization } from "../../../utils/org-management";
import { EnhancedOrg, OrgMembership } from "../../../../types/auth";

interface Env {
  ai_passport_registry: KVNamespace;
  ADMIN_TOKEN: string;
}

/**
 * Handle CORS preflight requests
 * OPTIONS /api/admin/organizations
 */
export const onRequestOptions: PagesFunction<Env> = async ({ request }) => {
  const headers = cors(request);
  return new Response(null, { headers });
};

/**
 * Get all organizations (admin only)
 * GET /api/admin/organizations
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const headers = cors(request);

  // Check admin token authentication
  const auth = request.headers.get("authorization");

  if (auth !== `Bearer ${env.ADMIN_TOKEN}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json", ...headers },
    });
  }

  try {
    // Get all organization keys
    const orgKeys = await env.ai_passport_registry.list({
      prefix: "org:",
    });

    const organizations: EnhancedOrg[] = [];

    // Process each organization
    for (const orgKey of orgKeys.keys) {
      try {
        const orgId = orgKey.name.replace("org:", "");
        const orgData = await getOrganization(env.ai_passport_registry, orgId);

        if (orgData) {
          // Get all members for this organization
          const allMemberships = await env.ai_passport_registry.list({
            prefix: `membership:org:${orgId}:`,
          });

          const members: OrgMembership[] = [];
          for (const memberKey of allMemberships.keys) {
            const memberData = await env.ai_passport_registry.get(
              memberKey.name,
              "json"
            );
            if (memberData) {
              members.push(memberData as OrgMembership);
            }
          }

          // Create enhanced organization response
          const enhancedOrg: EnhancedOrg = {
            org_id: orgData.org_id,
            name: orgData.name,
            domain: orgData.domain,
            contact_email: orgData.contact_email,
            members: members,
            created_at: orgData.created_at,
            updated_at: orgData.updated_at,
            assurance_level: orgData.assurance_level || "L0",
            can_issue_for_others: orgData.can_issue_for_others || false,
            org_key_id: orgData.org_key_id,
            org_key_hash: orgData.org_key_hash,
            status: orgData.status || "active",
          };

          organizations.push(enhancedOrg);
        }
      } catch (error) {
        console.error(`Error processing organization ${orgKey.name}:`, error);
        // Continue processing other organizations
      }
    }

    // Sort organizations by created_at (newest first)
    organizations.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return new Response(
      JSON.stringify({
        organizations,
        count: organizations.length,
      }),
      {
        status: 200,
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("List organizations error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to list organizations" }),
      {
        status: 500,
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
      }
    );
  }
};
