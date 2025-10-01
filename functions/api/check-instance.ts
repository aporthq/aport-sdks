import { createLogger } from "../utils/logger";
import { findInstanceByTenant } from "../utils/template-instance";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";
import { cors } from "../utils/cors";

interface Env {
  ai_passport_registry: KVNamespace;
  ADMIN_TOKEN: string;
  ADMIN_RPM?: string;
}

export const onRequestOptions: PagesFunction<Env> = async (context) => {
  const { request } = context;
  const corsHeaders = cors(request);

  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
};

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const logger = createLogger(env.ai_passport_registry);
  const corsHeaders = cors(request);

  try {
    // Only allow GET requests
    if (request.method !== "GET") {
      return new Response(
        JSON.stringify({
          error: "method_not_allowed",
          message: "Only GET requests are allowed",
        }),
        {
          status: 405,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Parse query parameters
    const url = new URL(request.url);
    const templateId = url.searchParams.get("template_id");
    const platformId = url.searchParams.get("platform_id");
    const tenantRef = url.searchParams.get("tenant_ref");

    // Validate required parameters
    if (!templateId || !platformId || !tenantRef) {
      return new Response(
        JSON.stringify({
          error: "missing_required_parameters",
          message: "template_id, platform_id, and tenant_ref are required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Check if instance already exists for this platform + tenant
    const existingInstanceId = await findInstanceByTenant(
      env.ai_passport_registry,
      platformId,
      tenantRef
    );

    if (existingInstanceId) {
      logger.logAudit({
        type: "instance_found",
        instance_id: existingInstanceId,
        platform_id: platformId,
        tenant_ref: tenantRef,
        template_id: templateId,
      });

      return new Response(
        JSON.stringify({
          instance_id: existingInstanceId,
          exists: true,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // No instance found
    logger.logAudit({
      type: "instance_not_found",
      platform_id: platformId,
      tenant_ref: tenantRef,
      template_id: templateId,
    });

    return new Response(
      JSON.stringify({
        exists: false,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error) {
    logger.logAudit({
      type: "check_instance_failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to check instance",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};
