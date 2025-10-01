/**
 * Admin endpoint to list attestations
 * GET /api/admin/attestations
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
 * /api/admin/attestations:
 *   get:
 *     summary: List attestations
 *     description: Get a paginated list of attestations with optional filtering
 *     operationId: listAttestations
 *     tags:
 *       - Admin
 *       - Attestations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: subject_id
 *         in: query
 *         description: Filter by subject ID (user or org)
 *         schema:
 *           type: string
 *           example: "ap_user_123"
 *       - name: subject_type
 *         in: query
 *         description: Filter by subject type
 *         schema:
 *           type: string
 *           enum: [user, org]
 *           example: "user"
 *       - name: type
 *         in: query
 *         description: Filter by attestation type
 *         schema:
 *           type: string
 *           enum: [email_verification, github_org_verification, domain_verification, platform_verification, kyc_verification, kyb_verification, financial_verification]
 *           example: "email_verification"
 *       - name: status
 *         in: query
 *         description: Filter by attestation status
 *         schema:
 *           type: string
 *           enum: [pending, verified, expired, revoked]
 *           example: "verified"
 *       - name: limit
 *         in: query
 *         description: Number of attestations to return
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *           example: 20
 *       - name: cursor
 *         in: query
 *         description: Cursor for pagination
 *         schema:
 *           type: string
 *           example: "att_1234567890_abcdef"
 *     responses:
 *       200:
 *         description: List of attestations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 attestations:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Attestation'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     limit:
 *                       type: integer
 *                       example: 20
 *                     cursor:
 *                       type: string
 *                       example: "att_1234567890_abcdef"
 *                     has_more:
 *                       type: boolean
 *                       example: true
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
class ListAttestationsHandler extends BaseApiHandler {
  async handleRequest(): Promise<Response> {
    // Check admin token authentication
    const auth = this.request.headers.get("authorization");
    if (auth !== `Bearer ${this.env.ADMIN_TOKEN}`) {
      return this.unauthorized("Invalid admin token");
    }

    const url = new URL(this.request.url);
    const subjectId = url.searchParams.get("subject_id");
    const subjectType = url.searchParams.get("subject_type") as
      | "user"
      | "org"
      | null;
    const type = url.searchParams.get("type");
    const status = url.searchParams.get("status");
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") || "20"),
      100
    );
    const cursor = url.searchParams.get("cursor");

    // Validate subject_type if provided
    if (subjectType && !["user", "org"].includes(subjectType)) {
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

      let attestations: any[] = [];

      if (subjectId && subjectType) {
        // Get attestations for specific subject
        attestations = await attestationService.getSubjectAttestations(
          subjectId,
          subjectType
        );
      } else {
        // Get all attestations (this would need to be implemented in the service)
        // For now, we'll return an empty array
        attestations = [];
      }

      // Apply filters
      if (type) {
        attestations = attestations.filter((a) => a.type === type);
      }
      if (status) {
        attestations = attestations.filter((a) => a.status === status);
      }

      // Apply pagination
      const startIndex = cursor
        ? attestations.findIndex((a) => a.attestation_id === cursor) + 1
        : 0;
      const endIndex = startIndex + limit;
      const paginatedAttestations = attestations.slice(startIndex, endIndex);
      const hasMore = endIndex < attestations.length;

      const response = new Response(
        JSON.stringify({
          ok: true,
          attestations: paginatedAttestations,
          pagination: {
            limit,
            cursor:
              paginatedAttestations.length > 0
                ? paginatedAttestations[paginatedAttestations.length - 1]
                    .attestation_id
                : null,
            has_more: hasMore,
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
      console.error("Error listing attestations:", error);
      return this.internalError("Failed to list attestations");
    }
  }
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const handler = new ListAttestationsHandler(
    context.request,
    context.env,
    {},
    context.params as Record<string, string>
  );
  return handler.execute({});
};
