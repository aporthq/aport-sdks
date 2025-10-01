import { cors } from "../utils/cors";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";

/**
 * @swagger
 * /.well-known/agent-passport-registry.json:
 *   get:
 *     summary: Get registry public key information
 *     description: Returns the registry's public key and metadata for signature verification
 *     operationId: getRegistryKey
 *     tags:
 *       - Registry
 *     responses:
 *       200:
 *         description: Registry key information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - registry_key_id
 *                 - public_key
 *                 - algorithm
 *                 - created_at
 *               properties:
 *                 registry_key_id:
 *                   type: string
 *                   description: Unique identifier for the registry key
 *                   example: "reg-2025-01"
 *                 public_key:
 *                   type: string
 *                   description: Base64 encoded Ed25519 public key
 *                   example: "MCowBQYDK2VwAyEA..."
 *                 algorithm:
 *                   type: string
 *                   description: Signature algorithm used
 *                   example: "Ed25519"
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                   description: When the key was created
 *                   example: "2025-01-15T10:30:00Z"
 *                 expires_at:
 *                   type: string
 *                   format: date-time
 *                   description: When the key expires (optional)
 *                   example: "2026-01-15T10:30:00Z"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "internal_server_error"
 *                 message:
 *                   type: string
 *                   example: "Failed to retrieve registry key information"
 */

interface Env {
  ai_passport_registry: KVNamespace;
  REGISTRY_KEY_ID: string;
  REGISTRY_PUBLIC_KEY: string;
  REGISTRY_KEY_CREATED_AT?: string;
  REGISTRY_KEY_EXPIRES_AT?: string;
}

export const onRequestOptions: PagesFunction<Env> = async ({ request }) => {
  const headers = cors(request as any);
  return new Response(null, { headers });
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const headers = cors(request as any);

  try {
    const registryInfo = {
      registry_key_id: env.REGISTRY_KEY_ID,
      public_key: env.REGISTRY_PUBLIC_KEY,
      algorithm: "Ed25519",
      created_at: env.REGISTRY_KEY_CREATED_AT || new Date().toISOString(),
      ...(env.REGISTRY_KEY_EXPIRES_AT && {
        expires_at: env.REGISTRY_KEY_EXPIRES_AT,
      }),
    };

    const response = new Response(JSON.stringify(registryInfo), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=3600, s-maxage=3600", // Cache for 1 hour
        ...headers,
      },
    });

    return response;
  } catch (error) {
    console.error("Failed to retrieve registry key information:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to retrieve registry key information",
      }),
      {
        status: 500,
        headers: {
          "content-type": "application/json",
          ...headers,
        },
      }
    );

    return response;
  }
};
