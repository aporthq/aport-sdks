/**
 * Public endpoint to verify attestations
 * GET /api/verify/attestation/{id}
 *
 * This endpoint allows external parties to verify attestations without requiring
 * admin authentication. It provides cryptographic verification of attestations
 * and their Verifiable Attestation.
 */

import { BaseApiHandler, BaseEnv } from "../../../utils/base-api-handler";
import { cors } from "../../../utils/cors";
import { AttestationService } from "../../../utils/attestation-service";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";

interface Env extends BaseEnv {
  ai_passport_registry: KVNamespace;
  REGISTRY_PUBLIC_KEY: string; // Public key for verification
  REGISTRY_KEY_ID: string;
}

/**
 * @swagger
 * /api/verify/attestation/{attestation_id}:
 *   get:
 *     summary: Verify an attestation
 *     description: Public endpoint to verify attestations cryptographically without requiring authentication. Provides cryptographic verification of attestations and their Verifiable Attestation chain.
 *     operationId: verifyAttestationPublic
 *     tags:
 *       - Public
 *       - Verification
 *       - Attestations
 *     parameters:
 *       - name: attestation_id
 *         in: path
 *         required: true
 *         description: The attestation ID to verify
 *         schema:
 *           type: string
 *           pattern: "^att_[a-zA-Z0-9_]+$"
 *           example: "att_1234567890_abcdef"
 *       - name: public_key
 *         in: query
 *         required: false
 *         description: Registry public key for verification (if not using default)
 *         schema:
 *           type: string
 *           format: base64
 *           example: "LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0K..."
 *     responses:
 *       200:
 *         description: Attestation verification successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - valid
 *               properties:
 *                 valid:
 *                   type: boolean
 *                   description: Whether the attestation is cryptographically valid
 *                   example: true
 *                 attestation:
 *                   type: object
 *                   description: Public attestation data (if valid)
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "att_1234567890_abcdef"
 *                     type:
 *                       type: string
 *                       example: "email_verification"
 *                     subject:
 *                       type: string
 *                       example: "user@example.com"
 *                     issued_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-01-16T10:30:00Z"
 *                     expires_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-02-16T10:30:00Z"
 *                     evidence:
 *                       type: object
 *                       description: Verification evidence
 *                       additionalProperties: true
 *                 audit_trail:
 *                   type: array
 *                   description: Verifiable audit trail
 *                   items:
 *                     type: object
 *                     properties:
 *                       action:
 *                         type: string
 *                         example: "attestation_created"
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-01-16T10:30:00Z"
 *                       signature:
 *                         type: string
 *                         example: "ed25519:xyz789"
 *                       hash:
 *                         type: string
 *                         example: "sha256:abc123def456"
 *                 verification_details:
 *                   type: object
 *                   description: Cryptographic verification details
 *                   properties:
 *                     signature_valid:
 *                       type: boolean
 *                       example: true
 *                     key_id:
 *                       type: string
 *                       example: "key_123"
 *                     algorithm:
 *                       type: string
 *                       example: "Ed25519"
 *                     verified_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-01-16T10:30:00Z"
 *                 errors:
 *                   type: array
 *                   description: Any verification errors
 *                   items:
 *                     type: string
 *                   example: []
 *       400:
 *         description: Bad request - invalid attestation ID or missing public key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "invalid_attestation_id"
 *               message: "Attestation ID must match pattern att_[a-zA-Z0-9_]+"
 *       404:
 *         description: Attestation not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                   example: false
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["Attestation not found"]
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "internal_server_error"
 *               message: "An unexpected error occurred during verification"
 */
class VerifyAttestationHandler extends BaseApiHandler {
  async handleRequest(): Promise<Response> {
    const attestationId = this.params?.attestation_id as string;
    if (!attestationId) {
      return this.badRequest("Attestation ID is required");
    }

    // Get public key from query parameter or use default
    const url = new URL(this.request.url);
    const publicKey =
      url.searchParams.get("public_key") || this.env.REGISTRY_PUBLIC_KEY;

    if (!publicKey) {
      return this.badRequest("Public key is required for verification");
    }

    try {
      // Create attestation service
      const attestationService = new AttestationService(
        this.env.ai_passport_registry,
        {
          registry_private_key: "", // Not needed for verification
          registry_key_id: this.env.REGISTRY_KEY_ID,
          signature_expires_days: 365,
          evidence_expires_days: {
            email_code: 30,
            dns_txt_record: 365,
            github_org_membership: 90,
            platform_install_token: 30,
            government_id: 365,
            business_registration: 365,
            financial_statement: 90,
          },
        }
      );

      // Verify the attestation
      const verificationResult =
        await attestationService.verifyAttestationPublic(
          attestationId,
          publicKey
        );

      if (verificationResult.valid) {
        return this.success(verificationResult, 200);
      } else {
        return this.badRequest(
          verificationResult.error || "Invalid attestation"
        );
      }
    } catch (error) {
      console.error("Error verifying attestation:", error);
      return this.internalError("Failed to verify attestation");
    }
  }
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const handler = new VerifyAttestationHandler(
    context.request,
    context.env,
    {},
    context.params as Record<string, string>
  );
  return handler.execute({});
};
