/**
 * Configuration Management for Cloudflare Workers Functions
 *
 * This module provides configuration management for Cloudflare Workers functions.
 * It handles environment variables from the Workers runtime environment.
 */

import { createWorkerConfig, type Config } from "../../config";

// Global configuration cache
let configCache: Config | null = null;

/**
 * Get configuration for Cloudflare Workers
 * Caches the configuration for performance
 */
export function getConfig(env: any): Config {
  if (!configCache) {
    configCache = createWorkerConfig(env);
  }
  return configCache;
}

/**
 * Clear configuration cache
 * Useful for testing or when environment changes
 */
export function clearConfigCache(): void {
  configCache = null;
}

/**
 * Get configuration with error handling
 * Returns a safe configuration object even if some values are missing
 */
export function getSafeConfig(env: any): Config {
  try {
    return getConfig(env);
  } catch (error) {
    console.error("Configuration error:", error);

    // Return a minimal safe configuration
    return {
      app: {
        version: env.AP_VERSION || "0.1",
        baseUrl: env.APP_BASE_URL || "http://localhost:3000",
        apiBaseUrl: env.APORT_BASE_URL || "http://localhost:8787",
      },
      auth: {
        jwtSecret: env.JWT_SECRET || "fallback-secret",
        claimTokenSecret: env.CLAIM_TOKEN_SECRET || "fallback-secret",
        adminToken: env.ADMIN_TOKEN || "fallback-token",
      },
      github: {
        clientId: env.GITHUB_CLIENT_ID || "",
        clientSecret: env.GITHUB_CLIENT_SECRET || "",
        redirectUri: env.GITHUB_REDIRECT_URI || "",
      },
      email: {
        resendApiKey: env.RESEND_API_KEY || "",
        fromEmail: env.RESEND_FROM_EMAIL || "noreply@example.com",
      },
      registry: {
        keyId: env.REGISTRY_KEY_ID || "",
        publicKey: env.REGISTRY_PUBLIC_KEY || "",
        privateKey: env.REGISTRY_PRIVATE_KEY || "",
        keyCreatedAt: env.REGISTRY_KEY_CREATED_AT || "",
        keyExpiresAt: env.REGISTRY_KEY_EXPIRES_AT || "",
      },
      rateLimiting: {
        verifyRpm: parseInt(env.VERIFY_RPM || "60"),
        adminRpm: parseInt(env.ADMIN_RPM || "100"),
        orgRpm: parseInt(env.ORG_RPM || "30"),
      },
      messages: {
        suspended: env.SUSPENDED_MESSAGE || "This agent is suspended",
        revoked: env.REVOKED_MESSAGE || "This agent has been revoked",
        suspendedMinimized: env.SUSPENDED_MESSAGE_MINIMIZED || "Suspended",
        revokedMinimized: env.REVOKED_MESSAGE_MINIMIZED || "Revoked",
      },
      webhooks: {
        url: env.WEBHOOK_URL,
        secret: env.WEBHOOK_SECRET,
      },
      seo: {
        googleSiteVerification: env.GOOGLE_SITE_VERIFICATION,
        bingSiteVerification: env.BING_SITE_VERIFICATION,
      },
      cloudflare: {
        kvNamespace: "ai_passport_registry",
        r2Bucket: "PASSPORT_SNAPSHOTS_BUCKET",
      },
    };
  }
}

/**
 * Check if configuration is valid
 */
export function isConfigValid(env: any): boolean {
  try {
    getConfig(env);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get configuration errors
 */
export function getConfigErrors(env: any): string[] {
  try {
    getConfig(env);
    return [];
  } catch (error) {
    return [
      error instanceof Error ? error.message : "Unknown configuration error",
    ];
  }
}

export default {
  getConfig,
  getSafeConfig,
  clearConfigCache,
  isConfigValid,
  getConfigErrors,
};
