/**
 * Admin attestations endpoint
 * POST /api/admin/attestations
 */

import {
  BaseApiHandler,
  BaseEnv,
  createApiHandler,
} from "../../../utils/base-api-handler";
import { cors } from "../../../utils/cors";
import { AttestationService } from "../../../utils/attestation-service";
import { CreateAttestationRequest } from "../../../../types/attestation";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";

interface Env extends BaseEnv {
  ai_passport_registry: KVNamespace;
  REGISTRY_PRIVATE_KEY: string;
  REGISTRY_KEY_ID: string;
}

/**
 * /api/admin/attestations:
 *   post:
 *     summary: Create a new attestation
 *     description: Create an attestation for a user or organization with evidence verification
 *     operationId: createAttestation
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
 *               - type
 *               - subject_id
 *               - subject_type
 *               - evidence
 *               - verified_by
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [email_verification, github_org_verification, domain_verification, platform_verification, kyc_verification, kyb_verification, financial_verification]
 *                 description: Type of attestation
 *                 example: "email_verification"
 *               subject_id:
 *                 type: string
 *                 description: User ID or Organization ID being attested
 *                 example: "ap_user_123"
 *               subject_type:
 *                 type: string
 *                 enum: [user, org]
 *                 description: Type of subject being attested
 *                 example: "user"
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
 *               comment:
 *                 type: string
 *                 description: Human-readable comment about the attestation
 *                 example: "Email verified via verification code"
 *               verified_by:
 *                 type: string
 *                 description: Registry operator or system that verified
 *                 example: "admin@aport.io"
 *               expires_at:
 *                 type: string
 *                 format: date-time
 *                 description: When this attestation expires
 *                 example: "2026-12-31T23:59:59Z"
 *     responses:
 *       201:
 *         description: Attestation created successfully
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
 *                   example: "Attestation created successfully"
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
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
class CreateAttestationHandler extends BaseApiHandler {
  async handleRequest(): Promise<Response> {
    // Check admin token authentication
    const auth = this.request.headers.get("authorization");
    if (auth !== `Bearer ${this.env.ADMIN_TOKEN}`) {
      return this.unauthorized("Invalid admin token");
    }

    const body = (await this.request
      .json()
      .catch(() => ({}))) as CreateAttestationRequest;

    // Validate required fields
    const requiredFields = [
      "type",
      "subject_id",
      "subject_type",
      "evidence",
      "verified_by",
    ];
    const validationError = this.validateRequiredFields(body, requiredFields);
    if (validationError) return validationError;

    // Validate evidence
    if (!body.evidence.type || !body.evidence.value) {
      return this.badRequest("Evidence must include type and value");
    }

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
        }
      );

      // Create attestation
      const attestation = await attestationService.createAttestation(body, {
        APP_BASE_URL: this.env.APP_BASE_URL,
        CLOUDFLARE_API_TOKEN: this.env.CLOUDFLARE_API_TOKEN,
        CLOUDFLARE_ZONE_ID: this.env.CLOUDFLARE_ZONE_ID,
      });

      const response = new Response(
        JSON.stringify({
          ok: true,
          message: "Attestation created successfully",
          attestation,
        }),
        {
          status: 201,
          headers: {
            "content-type": "application/json",
            ...cors(this.request),
          },
        }
      );

      return response;
    } catch (error) {
      console.error("Error creating attestation:", error);
      return this.internalError("Failed to create attestation");
    }
  }
}

// Export handlers
export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const handler = new CreateAttestationHandler(request, env, {
    allowedMethods: ["POST"],
    requireAuth: true,
    rateLimitRpm: 30,
    rateLimitType: "admin",
  });
  return handler.execute();
};
