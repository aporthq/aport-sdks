/**
 * Example function demonstrating centralized configuration usage
 * This is for demonstration purposes - you can delete this file
 */

import { getConfig, getSafeConfig } from "../utils/config";
import { cors } from "../utils/cors";
import { PagesFunction } from "@cloudflare/workers-types";

interface Env {
  // Cloudflare bindings
  ai_passport_registry: KVNamespace;
  PASSPORT_SNAPSHOTS_BUCKET: R2Bucket;

  // Environment variables (these will be loaded by the config system)
  AP_VERSION?: string;
  APP_BASE_URL?: string;
  APORT_BASE_URL?: string;
  JWT_SECRET?: string;
  ADMIN_TOKEN?: string;
  // ... other env vars
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const corsHeaders = cors(request);

  try {
    // Method 1: Get full configuration with validation
    const config = getConfig(env);

    return new Response(
      JSON.stringify({
        success: true,
        config: {
          app: {
            version: config.app.version,
            baseUrl: config.app.baseUrl,
            apiBaseUrl: config.app.apiBaseUrl,
          },
          rateLimiting: config.rateLimiting,
          // Don't expose sensitive data in response
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error) {
    // Method 2: Get safe configuration with fallbacks
    const safeConfig = getSafeConfig(env);

    return new Response(
      JSON.stringify({
        success: false,
        error: "Configuration error",
        fallbackConfig: {
          app: {
            version: safeConfig.app.version,
            baseUrl: safeConfig.app.baseUrl,
            apiBaseUrl: safeConfig.app.apiBaseUrl,
          },
        },
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  }
};
