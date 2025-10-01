import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";
import { createLogger } from "../utils/logger";
import { verifyInstallToken } from "../utils/install-token";
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
    // Only allow POST requests
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({
          error: "method_not_allowed",
          message: "Only POST requests are allowed",
        }),
        {
          status: 405,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Parse request body
    const { token } = (await request.json()) as { token: string };

    if (!token) {
      return new Response(
        JSON.stringify({
          error: "missing_token",
          message: "Token is required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Verify install token
    const result = await verifyInstallToken(token, env);

    if (!result.valid) {
      logger.logAudit({
        type: "invalid_install_token",
        error: result.error,
        token: token.substring(0, 20) + "...",
      });

      if (result.error === "Token expired") {
        return new Response(
          JSON.stringify({
            error: "token_expired",
            message: "Install token has expired",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      } else if (result.error === "Token not found or already used") {
        return new Response(
          JSON.stringify({
            error: "token_already_used",
            message: "Install token has already been used",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      } else {
        return new Response(
          JSON.stringify({
            error: "invalid_token",
            message: result.error,
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }
    }

    // Fetch template data
    let template = null;
    try {
      const templateData = await env.ai_passport_registry.get(
        `template:${result.template_id}`,
        "json"
      );

      if (!templateData) {
        // Try alternative key format
        const altTemplateData = await env.ai_passport_registry.get(
          `passport:${result.template_id}`,
          "json"
        );
        template = altTemplateData;
      } else {
        template = templateData;
      }
    } catch (error) {
      logger.logAudit({
        type: "template_fetch_error",
        template_id: result.template_id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    logger.logAudit({
      type: "install_token_verified",
      template_id: result.template_id,
      platform_id: result.platform_id,
      tenant_ref: result.tenant_ref,
    });

    return new Response(
      JSON.stringify({
        token: result,
        template,
        valid: true,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error) {
    logger.logAudit({
      type: "token_verification_failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to verify token",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};
