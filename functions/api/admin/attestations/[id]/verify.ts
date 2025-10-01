/**
 * Admin endpoint to verify attestation evidence
 * POST /api/admin/attestations/{attestation_id}/verify
 */

import {
  BaseApiHandler,
  BaseEnv,
  createApiHandler,
} from "../../../../utils/base-api-handler";
import { cors } from "../../../../utils/cors";
import { AttestationService } from "../../../../utils/attestation-service";
import { VerifyEvidenceRequest } from "../../../../../types/attestation";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";

interface Env extends BaseEnv {
  ai_passport_registry: KVNamespace;
  REGISTRY_PRIVATE_KEY: string;
  REGISTRY_KEY_ID: string;
}

/**
 * /api/admin/attestations/{attestation_id}/verify:
 *   post:
 *     summary: Verify attestation evidence
 *     description: Verify evidence for an existing attestation
 *     operationId: verifyAttestation
 *     tags:
 *       - Admin
 *       - Attestations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: attestation_id
 *         in: path
 *         required: true
 *         description: The attestation ID to verify
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
 *               - evidence
 *               - verified_by
 *             properties:
 *               evidence:
 *                 type: object
 *                 required:
 *                   - type
 *                   - value
 *                 properties:
 *                   type:
 *                     type: string
 *                     enum: [email_code, dns_txt_record, github_org_membership, platform_install_token, government_id, business_registration, financial_statement]
 *                     description: Type of evidence
 *                     example: "email_code"
 *                   value:
 *                     type: string
 *                     description: The actual evidence value
 *                     example: "user@example.com"
 *                   expires_at:
 *                     type: string
 *                     format: date-time
 *                     description: When the evidence expires
 *                     example: "2025-12-31T23:59:59Z"
 *                   metadata:
 *                     type: object
 *                     description: Additional evidence-specific data
 *               verified_by:
 *                 type: string
 *                 description: Registry operator or system that verified
 *                 example: "admin@aport.io"
 *               comment:
 *                 type: string
 *                 description: Human-readable comment about the verification
 *                 example: "Email code verified successfully"
 *     responses:
 *       200:
 *         description: Evidence verified successfully
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
 *                   example: "Evidence verified successfully"
 *                 attestation:
 *                   $ref: '#/components/schemas/Attestation'
 *                 propagation:
 *                   type: object
 *                   properties:
 *                     updated_passports:
 *                       type: number
 *                       example: 5
 *                     updated_instances:
 *                       type: number
 *                       example: 12
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
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
class VerifyAttestationHandler extends BaseApiHandler {
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

    const body = (await this.request.json().catch(() => ({}))) as Omit<
      VerifyEvidenceRequest,
      "attestation_id"
    >;

    // Validate required fields
    const requiredFields = ["evidence", "verified_by"];
    const validationError = this.validateRequiredFields(body, requiredFields);
    if (validationError) return validationError;

    // Validate evidence
    if (!body.evidence.type || !body.evidence.value) {
      return this.badRequest("Evidence must include type and value");
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

      // Verify evidence
      const verificationResult = await attestationService.verifyEvidence(
        {
          attestation_id: attestationId,
          evidence: body.evidence,
          verified_by: body.verified_by,
          comment: body.comment,
        },
        {
          APP_BASE_URL: this.env.APP_BASE_URL,
          CLOUDFLARE_API_TOKEN: this.env.CLOUDFLARE_API_TOKEN,
          CLOUDFLARE_ZONE_ID: this.env.CLOUDFLARE_ZONE_ID,
        }
      );

      if (!verificationResult.valid) {
        return this.badRequest(
          verificationResult.error || "Evidence verification failed"
        );
      }

      const response = new Response(
        JSON.stringify({
          ok: true,
          message: "Evidence verified successfully",
          attestation: verificationResult.attestation,
          propagation: {
            updated_passports: 0, // This would be populated by the service
            updated_instances: 0, // This would be populated by the service
            errors: [],
          },
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
      console.error("Error verifying attestation:", error);
      return this.internalError("Failed to verify attestation");
    }
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const handler = new VerifyAttestationHandler(
    context.request,
    context.env,
    {},
    context.params as Record<string, string>
  );
  return handler.execute({});
};
