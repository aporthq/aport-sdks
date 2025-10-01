import { createLogger, Logger } from "../../utils/logger";
import { cors } from "../../utils/cors";

interface Env {
  ai_passport_registry: KVNamespace;
  AP_VERSION: string;
}

interface PolicyPack {
  id: string;
  name: string;
  description: string;
  version: string;
  requires_capabilities: string[];
  min_assurance: string;
  limits_required: string[];
  enforcement: Record<string, string>;
  advice: string[];
  deprecation: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * @swagger
 * /api/policies/{policy_name}:
 *   get:
 *     summary: Get a policy pack by name and version
 *     description: Retrieves a specific policy pack configuration
 *     parameters:
 *       - in: path
 *         name: policy_name
 *         required: true
 *         schema:
 *           type: string
 *         description: Policy pack name with version (e.g., payments.refund.v1)
 *     responses:
 *       200:
 *         description: Policy pack configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 description:
 *                   type: string
 *                 version:
 *                   type: string
 *                 requires_capabilities:
 *                   type: array
 *                   items:
 *                     type: string
 *                 min_assurance:
 *                   type: string
 *                 limits_required:
 *                   type: array
 *                   items:
 *                     type: string
 *                 enforcement:
 *                   type: object
 *                 advice:
 *                   type: array
 *                   items:
 *                     type: string
 *                 deprecation:
 *                   type: string
 *                   nullable: true
 *                 created_at:
 *                   type: string
 *                 updated_at:
 *                   type: string
 *       404:
 *         description: Policy pack not found
 *       400:
 *         description: Invalid policy pack name format
 */
export class PolicyHandler {
  private logger!: Logger;

  private errorResponse(
    message: string,
    status: number,
    request: Request
  ): Response {
    return new Response(
      JSON.stringify({
        error: message,
        status,
        timestamp: new Date().toISOString(),
      }),
      {
        status,
        headers: {
          ...cors(request),
          "Content-Type": "application/json",
        },
      }
    );
  }

  async handle(request: Request, env: Env): Promise<Response> {
    // Initialize logger with KV namespace
    this.logger = createLogger(env.ai_passport_registry);
    const url = new URL(request.url);
    const policyName = url.pathname.split("/").pop();

    if (!policyName) {
      return this.errorResponse("Policy name is required", 400, request);
    }

    const policyNameRegex = /^([a-z_]+\.[a-z_]+\.v\d+|^[a-z_]+\.v\d+)$/;
    if (!policyNameRegex.test(policyName)) {
      return this.errorResponse(
        "Invalid policy name format. Expected format: name.vX (e.g., repo.v1) or category.action.vX (e.g., payments.refund.v1)",
        400,
        request
      );
    }

    try {
      const policy = await this.getPolicyPack(policyName);

      if (!policy) {
        return this.errorResponse(
          `Policy pack '${policyName}' not found`,
          404,
          request
        );
      }

      // Set cache headers for immutable policy packs
      const headers = {
        ...cors(request),
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600, immutable", // 1 hour cache
        ETag: `"${policy.id}-${policy.version}"`,
        "Last-Modified": policy.updated_at,
      };

      return new Response(JSON.stringify(policy), {
        status: 200,
        headers,
      });
    } catch (error) {
      this.logger.logError(request, error as Error, {
        route: `/api/policies/${policyName}`,
      });
      return this.errorResponse("Internal server error", 500, request);
    }
  }

  private async getPolicyPack(policyName: string): Promise<PolicyPack | null> {
    try {
      // Try to read from the policies directory
      const policyPath = `policies/${policyName}/policy.json`;

      // In a real implementation, you might read from a CDN or static files
      // For now, we'll define the policies inline
      const policies: Record<string, PolicyPack> = {
        "payments.refund.v1": {
          id: "payments.refund.v1",
          name: "Refunds Protection",
          description:
            "Protects refund endpoints with payment capabilities, assurance levels, and transaction limits",
          version: "1.0.0",
          requires_capabilities: ["payments.refund"],
          min_assurance: "L2",
          limits_required: [
            "refund_amount_max_per_tx",
            "refund_amount_daily_cap",
          ],
          enforcement: {
            amount_lte: "limits.refund_amount_max_per_tx",
            region_in: "regions",
          },
          advice: [
            "Cache /verify with ETag; 60s TTL",
            "Subscribe to status webhooks for instant suspend",
            "Log all refund attempts for Verifiable Attestation",
            "Consider implementing daily spend tracking",
          ],
          deprecation: null,
          created_at: "2025-01-16T00:00:00Z",
          updated_at: "2025-01-16T00:00:00Z",
        },
        "data.export.v1": {
          id: "data.export.v1",
          name: "Data Export Protection",
          description:
            "Protects data export endpoints with export capabilities, row limits, and PII handling",
          version: "1.0.0",
          requires_capabilities: ["data.export"],
          min_assurance: "L1",
          limits_required: ["max_export_rows", "allow_pii"],
          enforcement: {
            rows_lte: "limits.max_export_rows",
            pii_allowed: "limits.allow_pii",
          },
          advice: [
            "Cache /verify with ETag; 60s TTL",
            "Subscribe to status webhooks for instant suspend",
            "Implement data retention policies",
            "Consider Verifiable Attestation for sensitive exports",
          ],
          deprecation: null,
          created_at: "2025-01-16T00:00:00Z",
          updated_at: "2025-01-16T00:00:00Z",
        },
        "messaging.send.v1": {
          id: "messaging.send.v1",
          name: "Messaging Protection",
          description:
            "Protects messaging endpoints with rate limits, channel restrictions, and mention policies for PLG on-ramp",
          version: "1.0.0",
          requires_capabilities: ["messaging.send"],
          min_assurance: "L1",
          limits_required: ["msgs_per_min", "msgs_per_day"],
          enforcement: {
            channels_allowlist_enforced: "true",
            mention_policy_enforced: "true",
            rate_limits_enforced: "true",
          },
          advice: [
            "Implement rate limiting per agent and per channel",
            "Monitor for spam patterns and suspicious activity",
            "Log all message attempts for Verifiable Attestation",
            "Consider implementing channel-specific limits",
            "Use mention policies to prevent @everyone abuse",
            "Subscribe to status webhooks for instant suspend",
          ],
          deprecation: null,
          created_at: "2025-01-16T00:00:00Z",
          updated_at: "2025-01-16T00:00:00Z",
        },
        "repo.release.publish.v1": {
          id: "repo.release.publish.v1",
          name: "Repository Safety",
          description:
            "Protects repository operations with PR limits, merge controls, and path restrictions for dev-first safety",
          version: "1.0.0",
          requires_capabilities: ["repo.pr.create", "repo.merge"],
          min_assurance: "L2",
          limits_required: [
            "max_prs_per_day",
            "max_merges_per_day",
            "max_pr_size_kb",
          ],
          enforcement: {
            allowed_repos_enforced: "true",
            allowed_base_branches_enforced: "true",
            path_allowlist_enforced: "true",
            size_limits_enforced: "true",
            review_requirements_enforced: "true",
          },
          advice: [
            "Implement repository allowlists to prevent unauthorized access",
            "Use branch protection rules for critical branches",
            "Monitor PR size and complexity to prevent oversized changes",
            "Require code reviews for production merges",
            "Log all repository operations for Verifiable Attestation",
            "Use path allowlists to restrict file access patterns",
            "Subscribe to status webhooks for instant suspend",
          ],
          deprecation: null,
          created_at: "2025-01-16T00:00:00Z",
          updated_at: "2025-01-16T00:00:00Z",
        },
        // Legacy format support
        "repo.v1": {
          id: "repo.v1",
          name: "Repository Safety",
          description:
            "Protects repository operations with PR limits, merge controls, and path restrictions for dev-first safety",
          version: "1.0.0",
          requires_capabilities: ["repo.pr.create", "repo.merge"],
          min_assurance: "L2",
          limits_required: [
            "max_prs_per_day",
            "max_merges_per_day",
            "max_pr_size_kb",
          ],
          enforcement: {
            allowed_repos_enforced: "true",
            allowed_base_branches_enforced: "true",
            path_allowlist_enforced: "true",
            size_limits_enforced: "true",
            review_requirements_enforced: "true",
          },
          advice: [
            "Implement repository allowlists to prevent unauthorized access",
            "Use branch protection rules for critical branches",
            "Monitor PR size and complexity to prevent oversized changes",
            "Require code reviews for production merges",
            "Log all repository operations for Verifiable Attestation",
            "Use path allowlists to restrict file access patterns",
            "Subscribe to status webhooks for instant suspend",
          ],
          deprecation: "Use repo.release.publish.v1 instead",
          created_at: "2025-01-16T00:00:00Z",
          updated_at: "2025-01-16T00:00:00Z",
        },
        "messaging.v1": {
          id: "messaging.v1",
          name: "Messaging Protection",
          description:
            "Protects messaging endpoints with rate limits, channel restrictions, and mention policies for PLG on-ramp",
          version: "1.0.0",
          requires_capabilities: ["messaging.send"],
          min_assurance: "L1",
          limits_required: ["msgs_per_min", "msgs_per_day"],
          enforcement: {
            channels_allowlist_enforced: "true",
            mention_policy_enforced: "true",
            rate_limits_enforced: "true",
          },
          advice: [
            "Implement rate limiting per agent and per channel",
            "Monitor for spam patterns and suspicious activity",
            "Log all message attempts for Verifiable Attestation",
            "Consider implementing channel-specific limits",
            "Use mention policies to prevent @everyone abuse",
            "Subscribe to status webhooks for instant suspend",
          ],
          deprecation: "Use messaging.send.v1 instead",
          created_at: "2025-01-16T00:00:00Z",
          updated_at: "2025-01-16T00:00:00Z",
        },
      };

      return policies[policyName] || null;
    } catch (error) {
      // Note: We can't log here since we don't have access to the request object
      console.error("Error reading policy pack", { policyName, error });
      return null;
    }
  }
}

const handler = new PolicyHandler();

// Handle OPTIONS requests for CORS preflight
export const onRequestOptions = async ({ request }: { request: Request }) =>
  new Response(null, { headers: cors(request) });

export const onRequest: PagesFunction<Env> = async (context) => {
  return handler.handle(context.request, context.env);
};
