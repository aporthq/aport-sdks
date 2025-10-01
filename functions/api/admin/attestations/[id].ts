/**
 * Admin endpoint to get attestation by ID
 * GET /api/admin/attestations/{id}
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
 * /api/admin/attestations/{attestation_id}:
 *   get:
 *     summary: Get attestation by ID
 *     description: Retrieve a specific attestation by its ID
 *     operationId: getAttestation
 *     tags:
 *       - Admin
 *       - Attestations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: attestation_id
 *         in: path
 *         required: true
 *         description: The attestation ID to retrieve
 *         schema:
 *           type: string
 *           example: "att_1234567890_abcdef"
 *     responses:
 *       200:
 *         description: Attestation retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 attestation:
 *                   $ref: '#/components/schemas/Attestation'
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
class GetAttestationHandler extends BaseApiHandler {
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

      // Get attestation
      const attestation = await attestationService.getAttestation(
        attestationId
      );

      if (!attestation) {
        return this.notFound("Attestation not found");
      }

      const response = new Response(
        JSON.stringify({
          ok: true,
          attestation,
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
      console.error("Error getting attestation:", error);
      return this.internalError("Failed to get attestation");
    }
  }
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const handler = new GetAttestationHandler(
    context.request,
    context.env,
    {},
    context.params as Record<string, string>
  );
  return handler.execute({});
};
