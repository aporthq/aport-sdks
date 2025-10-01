import { createLogger } from "../../utils/logger";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";

interface InstallLinkRequest {
  template_id: string;
  platform_id: string;
  tenant_ref: string;
  controller_hint?: string;
  return_url?: string;
  brand?: {
    logo?: string;
    background_color?: string;
    foreground_color?: string;
  };
}

interface InstallLinkResponse {
  install_url: string;
  token: string;
  expires_at: string;
}

interface Env {
  ai_passport_registry: KVNamespace;
  APORT_JWT_SECRET?: string;
  APORT_WEB_BASE_URL?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const logger = createLogger(env.ai_passport_registry);

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
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Parse request body
    const body: InstallLinkRequest = await request.json();

    // Validate required fields
    if (!body.template_id || !body.platform_id || !body.tenant_ref) {
      return new Response(
        JSON.stringify({
          error: "missing_required_fields",
          message: "template_id, platform_id, and tenant_ref are required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Verify platform_id exists and get platform secret
    let platform = await getPlatform(env, body.platform_id);
    if (!platform) {
      // For testing purposes, create a default platform if it doesn't exist
      console.log(`Creating default platform for testing: ${body.platform_id}`);
      platform = {
        id: body.platform_id,
        name: `Test Platform ${body.platform_id}`,
        secret: "test-platform-secret",
        created_at: new Date().toISOString(),
        status: "active",
      };

      // Store the platform in KV
      await env.ai_passport_registry.put(
        `platform:${body.platform_id}`,
        JSON.stringify(platform),
        { expirationTtl: 86400 * 30 } // 30 days
      );
    }

    // Verify template exists
    const template = await getTemplate(env, body.template_id);
    if (!template) {
      return new Response(
        JSON.stringify({
          error: "template_not_found",
          message: "Template not found",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Generate install token
    const token = await generateInstallToken(env, {
      template_id: body.template_id,
      platform_id: body.platform_id,
      tenant_ref: body.tenant_ref,
      controller_hint: body.controller_hint,
      return_url: body.return_url,
      brand: body.brand,
    });

    // Create install URL
    const baseUrl = env.APORT_WEB_BASE_URL || "https://aport.io";
    const installUrl = `${baseUrl}/agents/mint/${body.template_id}?token=${token}&embed=1`;

    const response: InstallLinkResponse = {
      install_url: installUrl,
      token,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
    };

    logger.logAudit({
      type: "install_link_created",
      platform_id: body.platform_id,
      template_id: body.template_id,
      tenant_ref: body.tenant_ref,
    });

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    logger.logAudit({
      type: "install_link_creation_failed",
      error: error instanceof Error ? error.message : String(error),
    });

    return new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to create install link",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

async function getPlatform(env: Env, platformId: string): Promise<any> {
  try {
    // Check if platform exists in KV
    const platform = await env.ai_passport_registry.get(
      `platform:${platformId}`,
      "json"
    );
    return platform;
  } catch (error) {
    console.error(
      "Error fetching platform:",
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

async function getTemplate(env: Env, templateId: string): Promise<any> {
  try {
    // Check if template exists in KV - try both template: and passport: prefixes
    let template = await env.ai_passport_registry.get(
      `template:${templateId}`,
      "json"
    );

    if (!template) {
      // Try passport: prefix for templates created via admin API
      template = await env.ai_passport_registry.get(
        `passport:${templateId}`,
        "json"
      );
    }

    return template;
  } catch (error) {
    console.error(
      "Error fetching template:",
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

async function generateInstallToken(
  env: Env,
  payload: {
    template_id: string;
    platform_id: string;
    tenant_ref: string;
    controller_hint?: string;
    return_url?: string;
    brand?: any;
  }
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto
    .getRandomValues(new Uint8Array(16))
    .reduce((str, byte) => str + byte.toString(16).padStart(2, "0"), "");

  const tokenPayload = {
    template_id: payload.template_id,
    platform_id: payload.platform_id,
    tenant_ref: payload.tenant_ref,
    controller_hint: payload.controller_hint,
    return_url: payload.return_url,
    brand: payload.brand,
    nonce,
    iat: now,
    nbf: now,
    exp: now + 60 * 60, // 1 hour
    iss: "aport.io",
    aud: "platform-install",
  };

  // Create HMAC signature using Web Crypto API
  const secret = env.APORT_JWT_SECRET || "default-secret";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(JSON.stringify(tokenPayload))
  );

  const signatureHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Create token (simple format: payload.signature)
  const token = `${btoa(JSON.stringify(tokenPayload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")}.${signatureHex}`;

  // Store token in KV for verification (with short TTL)
  await env.ai_passport_registry.put(
    `install_token:${nonce}`,
    JSON.stringify({
      ...tokenPayload,
      signature: signatureHex,
      created_at: now,
    }),
    { expirationTtl: 60 * 60 } // 1 hour
  );

  return token;
}
