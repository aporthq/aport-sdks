/**
 * Admin endpoint to revoke attestations
 * POST /api/admin/attestations/{attestation_id}/revoke
 */

import {
  BaseApiHandler,
  BaseEnv,
  createApiHandler,
} from "../../../../utils/base-api-handler";
import { cors } from "../../../../utils/cors";
import { AttestationService } from "../../../../utils/attestation-service";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";

interface Env extends BaseEnv {
  ai_passport_registry: KVNamespace;
  REGISTRY_PRIVATE_KEY: string;
  REGISTRY_KEY_ID: string;
}

/**
 * /api/admin/attestations/{attestation_id}/revoke:
 *   post:
 *     summary: Revoke an attestation
 *     description: Revoke an existing attestation with a reason
 *     operationId: revokeAttestation
 *     tags:
 *       - Admin
 *       - Attestations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: attestation_id
 *         in: path
 *         required: true
 *         description: The attestation ID to revoke
 *         schema:
 *           type: string
 *           example: "att_1234567890_abcdef"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *               - actor
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for revoking the attestation
 *                 example: "Evidence was found to be fraudulent"
 *               actor:
 *                 type: string
 *                 description: Who is revoking the attestation
 *                 example: "admin@aport.io"
 *     responses:
 *       200:
 *         description: Attestation revoked successfully
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
 *                   example: "Attestation revoked successfully"
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Attestation not found
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
class RevokeAttestationHandler extends BaseApiHandler {
  async handleRequest(): Promise<Response> {
    // Check admin token authentication
    const auth = this.request.headers.get("authorization");
    if (auth !== `Bearer ${this.env.ADMIN_TOKEN}`) {
      return this.unauthorized("Invalid admin token");
    }

    const attestationId = this.params?.attestation_id as string;

    if (!attestationId) {
      return this.badRequest("Attestation ID is required");
    }

    const body = (await this.request.json().catch(() => ({}))) as {
      reason: string;
      actor: string;
    };

    // Validate required fields
    const requiredFields = ["reason", "actor"];
    const validationError = this.validateRequiredFields(body, requiredFields);
    if (validationError) return validationError;

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
        }
      );

      // Revoke attestation
      const success = await attestationService.revokeAttestation(
        attestationId,
        body.reason,
        body.actor
      );

      if (!success) {
        return this.notFound("Attestation not found");
      }

      const response = new Response(
        JSON.stringify({
          ok: true,
          message: "Attestation revoked successfully",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            ...cors(this.request),
          },
        }
      );

      return response;
    } catch (error) {
      console.error("Error revoking attestation:", error);
      return this.internalError("Failed to revoke attestation");
    }
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const handler = new RevokeAttestationHandler(
    context.request,
    context.env,
    {},
    context.params as Record<string, string>
  );
  return handler.execute({});
};
