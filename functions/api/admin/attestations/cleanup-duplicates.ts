/**
 * Admin endpoint to clean up duplicate attestations
 * POST /api/admin/attestations/cleanup-duplicates
 */

import {
  BaseApiHandler,
  BaseEnv,
  createApiHandler,
} from "../../../utils/base-api-handler";
import { cors } from "../../../utils/cors";
import { AttestationService } from "../../../utils/attestation-service";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";

interface Env extends BaseEnv {
  ai_passport_registry: KVNamespace;
  REGISTRY_PRIVATE_KEY: string;
  REGISTRY_KEY_ID: string;
}

/**
 * /api/admin/attestations/cleanup-duplicates:
 *   post:
 *     summary: Clean up duplicate attestations
 *     description: Remove duplicate attestations for a subject, keeping only the most recent one
 *     operationId: cleanupDuplicateAttestations
 *     tags:
 *       - Admin
 *       - Attestations
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subject_id
 *               - subject_type
 *             properties:
 *               subject_id:
 *                 type: string
 *                 description: ID of the subject (user or org)
 *                 example: "ap_user_123"
 *               subject_type:
 *                 type: string
 *                 enum: [user, org]
 *                 description: Type of subject
 *                 example: "user"
 *     responses:
 *       200:
 *         description: Cleanup completed successfully
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
 *                   example: "Cleanup completed successfully"
 *                 result:
 *                   type: object
 *                   properties:
 *                     removed:
 *                       type: number
 *                       description: Number of duplicate attestations removed
 *                       example: 5
 *                     kept:
 *                       type: number
 *                       description: Number of attestations kept
 *                       example: 3
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
class CleanupDuplicatesHandler extends BaseApiHandler {
  async handleRequest(): Promise<Response> {
    // Check admin token authentication
    const auth = this.request.headers.get("authorization");
    if (auth !== `Bearer ${this.env.ADMIN_TOKEN}`) {
      return this.unauthorized("Invalid admin token");
    }

    const body = (await this.request.json().catch(() => ({}))) as {
      subject_id: string;
      subject_type: "user" | "org";
    };

    // Validate required fields
    const requiredFields = ["subject_id", "subject_type"];
    const validationError = this.validateRequiredFields(body, requiredFields);
    if (validationError) return validationError;

    // Validate subject type
    if (!["user", "org"].includes(body.subject_type)) {
      return this.badRequest("Subject type must be 'user' or 'org'");
    }

    try {
      // Create attestation service
      const attestationService = new AttestationService(
        this.env.ai_passport_registry,
        {
          registry_private_key: this.env.REGISTRY_PRIVATE_KEY || "",
          registry_key_id: this.env.REGISTRY_KEY_ID || "",
          signature_expires_days: 365,
          evidence_expires_days: {
            email_code: 30,
            dns_txt_record: 365,
            github_org_membership: 90,
            platform_install_token: 30,
            government_id: 365,
            business_registration: 365,
            financial_statement: 90,
            github_verification: 90,
          },
        },
        this.env.AP_VERSION
      );

      // Clean up duplicate attestations
      const result = await attestationService.cleanupDuplicateAttestations(
        body.subject_id,
        body.subject_type
      );

      const response = new Response(
        JSON.stringify({
          ok: true,
          message: "Cleanup completed successfully",
          result,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...cors,
          },
        }
      );

      return response;
    } catch (error) {
      console.error("Error cleaning up duplicate attestations:", error);
      return this.internalError(
        error instanceof Error ? error.message : "Internal server error"
      );
    }
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const handler = new CleanupDuplicatesHandler(request, env, {
    allowedMethods: ["POST"],
    requireAuth: true,
    rateLimitRpm: 30,
    rateLimitType: "admin",
  });
  return handler.execute();
};
