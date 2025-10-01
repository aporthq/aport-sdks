import { PagesFunction } from "@cloudflare/workers-types";
import { cors } from "../../../../utils/cors";
import {
  setOrgIssuerFlag,
  getOrganization,
} from "../../../../utils/org-management";
import {
  createAuditAction,
  completeAuditAction,
} from "../../../../utils/audit-trail";

interface Env {
  ai_passport_registry: KVNamespace;
  ADMIN_TOKEN: string;
  REGISTRY_PRIVATE_KEY?: string;
}

/**
 * Handle CORS preflight requests
 * OPTIONS /api/admin/organizations/[id]/issuer
 */
export const onRequestOptions: PagesFunction<Env> = async ({ request }) => {
  const headers = cors(request);
  return new Response(null, { headers });
};

/**
 * Set organization issuer flag (admin only)
 * PATCH /api/admin/organizations/[id]/issuer
 */
export const onRequestPatch: PagesFunction<Env> = async ({
  request,
  env,
  params,
}) => {
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
    const orgId = params?.id as string;

    if (!orgId) {
      return new Response(
        JSON.stringify({ error: "Organization ID is required" }),
        {
          status: 400,
          headers: { "content-type": "application/json", ...headers },
        }
      );
    }

    const body = (await request.json()) as {
      can_issue_for_others?: boolean;
    };
    const { can_issue_for_others } = body;

    if (typeof can_issue_for_others !== "boolean") {
      return new Response(
        JSON.stringify({ error: "can_issue_for_others must be a boolean" }),
        {
          status: 400,
          headers: { "content-type": "application/json", ...headers },
        }
      );
    }

    // Check if organization exists
    const org = await getOrganization(env.ai_passport_registry, orgId);
    if (!org) {
      return new Response(JSON.stringify({ error: "Organization not found" }), {
        status: 404,
        headers: { "content-type": "application/json", ...headers },
      });
    }

    // Set issuer flag
    await setOrgIssuerFlag(
      env.ai_passport_registry,
      orgId,
      can_issue_for_others
    );

    // Audit the issuer flag change
    const auditData = await createAuditAction(
      "update",
      orgId,
      "admin", // Admin user
      {
        issuer_flag_changed: {
          from: { can_issue_for_others: org.can_issue_for_others || false },
          to: { can_issue_for_others },
        },
      },
      "Organization issuer flag updated by admin",
      {
        can_issue_for_others,
        org_name: org.name,
      }
    );

    if (env.REGISTRY_PRIVATE_KEY) {
      await completeAuditAction(auditData, null, env.REGISTRY_PRIVATE_KEY);
    }

    return new Response(
      JSON.stringify({
        org_id: orgId,
        can_issue_for_others,
        message: "Issuer flag updated successfully",
      }),
      {
        status: 200,
        headers: { "content-type": "application/json", ...headers },
      }
    );
  } catch (error) {
    console.error("Error setting issuer flag:", error);
    return new Response(
      JSON.stringify({ error: "Failed to set issuer flag" }),
      {
        status: 500,
        headers: { "content-type": "application/json", ...headers },
      }
    );
  }
};

/**
 * Get organization issuer status (admin only)
 * GET /api/admin/organizations/[id]/issuer
 */
export const onRequestGet: PagesFunction<Env> = async ({
  request,
  env,
  params,
}) => {
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
    const orgId = params?.id as string;

    if (!orgId) {
      return new Response(
        JSON.stringify({ error: "Organization ID is required" }),
        {
          status: 400,
          headers: { "content-type": "application/json", ...headers },
        }
      );
    }

    const org = await getOrganization(env.ai_passport_registry, orgId);
    if (!org) {
      return new Response(JSON.stringify({ error: "Organization not found" }), {
        status: 404,
        headers: { "content-type": "application/json", ...headers },
      });
    }

    return new Response(
      JSON.stringify({
        org_id: orgId,
        can_issue_for_others: org.can_issue_for_others || false,
        message: "Issuer status retrieved successfully",
      }),
      {
        status: 200,
        headers: { "content-type": "application/json", ...headers },
      }
    );
  } catch (error) {
    console.error("Error getting issuer status:", error);
    return new Response(
      JSON.stringify({ error: "Failed to get issuer status" }),
      {
        status: 500,
        headers: { "content-type": "application/json", ...headers },
      }
    );
  }
};
