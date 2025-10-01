/**
 * Admin endpoint for manual backup cleanup
 * Can be called by external cron services or manually
 */

import { cors } from "../../utils/cors";
import { createLogger } from "../../utils/logger";
import { createPassportBackupManager } from "../../utils/passport-backup";
import {
  KVNamespace,
  R2Bucket,
  PagesFunction,
} from "@cloudflare/workers-types";

interface Env {
  ai_passport_registry: KVNamespace;
  PASSPORT_SNAPSHOTS_BUCKET: R2Bucket;
  ADMIN_TOKEN: string;
}

/**
 * /api/admin/cleanup-backups:
 *   post:
 *     summary: Clean up old passport backups
 *     description: Manually trigger cleanup of old passport backups
 *     operationId: cleanupBackups
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Backup cleanup completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Backup cleanup completed"
 *                 cleaned:
 *                   type: number
 *                   example: 15
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const headers = cors(request);
  const logger = createLogger(env.ai_passport_registry);

  // Check admin authentication
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({
        error: "unauthorized",
        message: "Admin token required",
      }),
      {
        status: 401,
        headers: { "content-type": "application/json", ...headers },
      }
    );
  }

  const token = authHeader.substring(7);
  if (token !== env.ADMIN_TOKEN) {
    return new Response(
      JSON.stringify({ error: "unauthorized", message: "Invalid admin token" }),
      {
        status: 401,
        headers: { "content-type": "application/json", ...headers },
      }
    );
  }

  try {
    const startTime = Date.now();
    console.log("🧹 Starting backup cleanup job...");

    const backupManager = createPassportBackupManager(
      env.PASSPORT_SNAPSHOTS_BUCKET
    );

    // Get all agents that have backups
    const agents = await getAllAgentsWithBackups(env.PASSPORT_SNAPSHOTS_BUCKET);

    let totalCleaned = 0;
    let totalErrors = 0;
    const results = [];

    console.log(`Found ${agents.length} agents with backups`);

    // Clean up backups for each agent
    for (const agentId of agents) {
      try {
        const cleaned = await backupManager.cleanupOldBackups(agentId, 10); // Keep last 10 backups
        totalCleaned += cleaned;
        results.push({ agentId, cleaned, success: true });

        if (cleaned > 0) {
          console.log(`Cleaned ${cleaned} old backups for ${agentId}`);
        }
      } catch (error) {
        totalErrors++;
        results.push({
          agentId,
          cleaned: 0,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        console.error(`Failed to cleanup backups for ${agentId}:`, error);
      }
    }

    const duration = Date.now() - startTime;

    console.log(`✅ Backup cleanup completed in ${duration}ms`);
    console.log(`   Total backups cleaned: ${totalCleaned}`);
    console.log(`   Agents processed: ${agents.length}`);
    console.log(`   Errors: ${totalErrors}`);

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Backup cleanup completed",
        duration,
        cleaned: totalCleaned,
        agentsProcessed: agents.length,
        errors: totalErrors,
        results,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json", ...headers },
      }
    );
  } catch (error) {
    console.error("❌ Backup cleanup job failed:", error);

    return new Response(
      JSON.stringify({
        ok: false,
        error: "cleanup_failed",
        message: "Backup cleanup failed",
        details: error instanceof Error ? error.message : String(error),
        duration: Date.now() - Date.now(),
      }),
      {
        status: 500,
        headers: { "content-type": "application/json", ...headers },
      }
    );
  }
};

/**
 * Get all agents that have backups in R2
 */
async function getAllAgentsWithBackups(bucket: R2Bucket): Promise<string[]> {
  const agents = new Set<string>();

  try {
    // List all objects with passport-backups prefix
    let cursor: string | undefined;

    do {
      const listResult = await bucket.list({
        prefix: "passport-backups/",
        limit: 1000,
        cursor,
      });

      // Extract agent IDs from keys
      for (const obj of listResult.objects) {
        const keyParts = obj.key.split("/");
        if (keyParts.length >= 2) {
          agents.add(keyParts[1]); // agent ID is the second part
        }
      }

      cursor = (listResult as any).cursor;
    } while (cursor);

    return Array.from(agents);
  } catch (error) {
    console.error("Failed to list agents with backups:", error);
    return [];
  }
}
