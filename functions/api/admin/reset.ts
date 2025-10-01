import { PagesFunction } from "@cloudflare/workers-types";
import { cors } from "../../utils/cors";

interface Env {
  ai_passport_registry: KVNamespace;
  ADMIN_TOKEN: string;
}

/**
 * Handle CORS preflight requests
 * OPTIONS /api/admin/reset
 */
export const onRequestOptions: PagesFunction<Env> = async ({ request }) => {
  const headers = cors(request);
  return new Response(null, { headers });
};

/**
 * Reset all data (admin only)
 * POST /api/admin/reset
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
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
    console.log("🧹 Admin reset requested - clearing all data...");

    // Get all keys from the KV store
    const allKeys = await env.ai_passport_registry.list();

    // Delete all keys
    const deletePromises = allKeys.keys.map((key) =>
      env.ai_passport_registry.delete(key.name)
    );

    await Promise.all(deletePromises);

    console.log(`✅ Deleted ${allKeys.keys.length} keys from KV store`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "All data has been reset",
        deleted_keys: allKeys.keys.length,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { "content-type": "application/json", ...headers },
      }
    );
  } catch (error) {
    console.error("❌ Error during reset:", error);
    return new Response(
      JSON.stringify({
        error: "reset_failed",
        message: "Failed to reset data",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json", ...headers },
      }
    );
  }
};
