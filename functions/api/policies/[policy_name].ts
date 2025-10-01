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
  status: string;
  requires_capabilities: string[];
  min_assurance: string;
  limits_required: string[];
  required_fields: string[];
  optional_fields: string[];
  enforcement: Record<string, string | boolean>;
  mcp: Record<string, any>;
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
 *                 status:
 *                   type: string
 *                   enum: [active, suspended, deprecated]
 *                 requires_capabilities:
 *                   type: array
 *                   items:
 *                     type: string
 *                 min_assurance:
 *                   type: string
 *                   enum: [L0, L1, L2, L3, L4KYC, L4FIN]
 *                 limits_required:
 *                   type: array
 *                   items:
 *                     type: string
 *                 required_fields:
 *                   type: array
 *                   items:
 *                     type: string
 *                 optional_fields:
 *                   type: array
 *                   items:
 *                     type: string
 *                 enforcement:
 *                   type: object
 *                   additionalProperties:
 *                     oneOf:
 *                       - type: string
 *                       - type: boolean
 *                 mcp:
 *                   type: object
 *                   description: Model Context Protocol requirements
 *                 advice:
 *                   type: array
 *                   items:
 *                     type: string
 *                 deprecation:
 *                   type: string
 *                   nullable: true
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                 updated_at:
 *                   type: string
 *                   format: date-time
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
        "Invalid policy name format. Expected format: name.vX (e.g., repo.v1) or category.action.vX (e.g., payments.charge.v1)",
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
        "payments.charge.v1": {
          id: "payments.charge.v1",
          name: "Payment Charge Policy",
          description:
            "Pre-act governance for agent-initiated payments. Enforces per-currency caps, merchant/region allowlists, category blocks, assurance minimums, and idempotency.",
          version: "1.0.0",
          status: "active",
          requires_capabilities: ["payments.charge"],
          min_assurance: "L2",
          limits_required: [
            "currency_limits",
            "allowed_merchant_ids",
            "allowed_countries",
            "blocked_categories",
            "max_items_per_tx",
            "require_assurance_at_least",
            "idempotency_required",
          ],
          required_fields: [
            "amount",
            "currency",
            "merchant_id",
            "region",
            "items",
            "idempotency_key",
          ],
          optional_fields: ["shipping_country", "risk_score"],
          enforcement: {
            currency_supported: true,
            region_in: true,
            idempotency_required: true,
            amount_lte:
              "limits.payments.charge.currency_limits.{currency}.max_per_tx",
            daily_cap_check:
              "limits.payments.charge.currency_limits.{currency}.daily_cap",
            merchant_allowlist: "limits.payments.charge.allowed_merchant_ids",
            country_allowlist: "limits.payments.charge.allowed_countries",
            category_blocklist: "limits.payments.charge.blocked_categories",
            item_count_cap: "limits.payments.charge.max_items_per_tx",
          },
          mcp: {
            require_allowlisted_if_present: true,
          },
          advice: [
            "Cache /verify with ETag; 60s TTL",
            "Subscribe to status webhooks for instant suspend",
            "Log all charge attempts for Verifiable Attestation",
            "Implement daily spend tracking per currency to prevent abuse",
            "Always use unique idempotency keys to prevent duplicate charges",
            "Provide clear error messages to help agents self-remediate",
            "Maintain merchant allowlists for trusted partners",
            "Block high-risk categories (weapons, illicit goods)",
          ],
          deprecation: null,
          created_at: "2025-01-30T00:00:00Z",
          updated_at: "2025-01-30T00:00:00Z",
        },
        "payments.refund.v1": {
          id: "payments.refund.v1",
          name: "Refunds Protection Policy",
          description:
            "Post-act governance for refund operations. Enforces per-currency caps, reason code validation, cross-currency restrictions, and idempotency.",
          version: "1.0.0",
          status: "active",
          requires_capabilities: ["payments.refund"],
          min_assurance: "L2",
          limits_required: [
            "supported_currencies",
            "currency_limits",
            "refund_reason_codes",
            "regions",
          ],
          required_fields: [
            "order_id",
            "customer_id",
            "amount_minor",
            "currency",
            "region",
            "reason_code",
            "idempotency_key",
          ],
          optional_fields: [
            "note",
            "merchant_case_id",
            "order_currency",
            "order_total_minor",
            "already_refunded_minor",
          ],
          enforcement: {
            amount_lte:
              "limits.payments.refund.currency_limits.{currency}.max_per_tx",
            currency_supported: "limits.payments.refund.supported_currencies",
            region_in: "regions",
            reason_code_valid: "limits.payments.refund.refund_reason_codes",
            assurance_tier_enforced: true,
            idempotency_required: true,
            order_id_required: true,
            customer_id_required: true,
            cross_currency_denied: true,
          },
          mcp: {
            require_allowlisted_if_present: true,
          },
          advice: [
            "Cache /verify with ETag; 60s TTL",
            "Subscribe to status webhooks for instant suspend",
            "Log all refund attempts for Verifiable Attestation",
            "Implement daily spend tracking per currency to prevent abuse",
            "Always use unique idempotency keys to prevent duplicate charges",
            "Provide clear error messages to help agents self-remediate",
            "Maintain merchant allowlists for trusted partners",
            "Block high-risk categories (weapons, illicit goods)",
          ],
          deprecation: null,
          created_at: "2025-01-30T00:00:00Z",
          updated_at: "2025-01-30T00:00:00Z",
        },
        "data.export.v1": {
          id: "data.export.v1",
          name: "Data Export Protection Policy",
          description:
            "Pre-act governance for data export operations. Enforces row limits, PII handling requirements, and export capability validation.",
          version: "1.0.0",
          status: "active",
          requires_capabilities: ["data.export"],
          min_assurance: "L1",
          limits_required: ["max_export_rows", "allow_pii"],
          required_fields: ["export_type", "format", "filters"],
          optional_fields: ["include_pii", "date_range", "columns"],
          enforcement: {
            rows_lte: "limits.data.export.max_export_rows",
            pii_allowed: "limits.data.export.allow_pii",
          },
          mcp: {
            require_allowlisted_if_present: true,
          },
          advice: [
            "Cache /verify with ETag; 60s TTL",
            "Subscribe to status webhooks for instant suspend",
            "Implement data retention policies",
            "Consider Verifiable Attestation for sensitive exports",
            "Log all export attempts for audit compliance",
            "Implement progressive disclosure for large datasets",
            "Use secure delivery methods for sensitive data",
          ],
          deprecation: null,
          created_at: "2025-01-30T00:00:00Z",
          updated_at: "2025-01-30T00:00:00Z",
        },
        "messaging.send.v1": {
          id: "messaging.send.v1",
          name: "Messaging Protection Policy",
          description:
            "Pre-act governance for messaging operations. Enforces rate limits, channel restrictions, mention policies, and content validation for PLG on-ramp.",
          version: "1.0.0",
          status: "active",
          requires_capabilities: ["messaging.send"],
          min_assurance: "L1",
          limits_required: ["msgs_per_min", "msgs_per_day"],
          required_fields: ["channel_id", "message", "message_type"],
          optional_fields: ["mentions", "attachments", "thread_id", "reply_to"],
          enforcement: {
            channels_allowlist_enforced: true,
            mention_policy_enforced: true,
            rate_limits_enforced: true,
          },
          mcp: {
            require_allowlisted_if_present: true,
          },
          advice: [
            "Implement rate limiting per agent and per channel",
            "Monitor for spam patterns and suspicious activity",
            "Log all message attempts for Verifiable Attestation",
            "Consider implementing channel-specific limits",
            "Use mention policies to prevent @everyone abuse",
            "Subscribe to status webhooks for instant suspend",
            "Implement content filtering for inappropriate messages",
            "Use progressive rate limiting for new agents",
          ],
          deprecation: null,
          created_at: "2025-01-30T00:00:00Z",
          updated_at: "2025-01-30T00:00:00Z",
        },
        "repo.release.publish.v1": {
          id: "repo.release.publish.v1",
          name: "Repository Safety Policy",
          description:
            "Pre-act governance for repository operations. Enforces PR limits, merge controls, path restrictions, and review requirements for dev-first safety.",
          version: "1.0.0",
          status: "active",
          requires_capabilities: ["repo.pr.create", "repo.merge"],
          min_assurance: "L2",
          limits_required: [
            "max_prs_per_day",
            "max_merges_per_day",
            "max_pr_size_kb",
          ],
          required_fields: ["repository", "action", "branch"],
          optional_fields: [
            "base_branch",
            "title",
            "description",
            "files_changed",
            "lines_added",
            "lines_removed",
          ],
          enforcement: {
            allowed_repos_enforced: true,
            allowed_base_branches_enforced: true,
            path_allowlist_enforced: true,
            size_limits_enforced: true,
            review_requirements_enforced: true,
          },
          mcp: {
            require_allowlisted_if_present: true,
          },
          advice: [
            "Implement repository allowlists to prevent unauthorized access",
            "Use branch protection rules for critical branches",
            "Monitor PR size and complexity to prevent oversized changes",
            "Require code reviews for production merges",
            "Log all repository operations for Verifiable Attestation",
            "Use path allowlists to restrict file access patterns",
            "Subscribe to status webhooks for instant suspend",
            "Implement progressive limits for new agents",
            "Use automated testing requirements for large changes",
          ],
          deprecation: null,
          created_at: "2025-01-30T00:00:00Z",
          updated_at: "2025-01-30T00:00:00Z",
        },
        // Legacy format support
        "repo.v1": {
          id: "repo.v1",
          name: "Repository Safety Policy",
          description:
            "Pre-act governance for repository operations. Enforces PR limits, merge controls, path restrictions, and review requirements for dev-first safety.",
          version: "1.0.0",
          status: "active",
          requires_capabilities: ["repo.pr.create", "repo.merge"],
          min_assurance: "L2",
          limits_required: [
            "max_prs_per_day",
            "max_merges_per_day",
            "max_pr_size_kb",
          ],
          required_fields: ["repository", "action", "branch"],
          optional_fields: [
            "base_branch",
            "title",
            "description",
            "files_changed",
            "lines_added",
            "lines_removed",
          ],
          enforcement: {
            allowed_repos_enforced: true,
            allowed_base_branches_enforced: true,
            path_allowlist_enforced: true,
            size_limits_enforced: true,
            review_requirements_enforced: true,
          },
          mcp: {
            require_allowlisted_if_present: true,
          },
          advice: [
            "Implement repository allowlists to prevent unauthorized access",
            "Use branch protection rules for critical branches",
            "Monitor PR size and complexity to prevent oversized changes",
            "Require code reviews for production merges",
            "Log all repository operations for Verifiable Attestation",
            "Use path allowlists to restrict file access patterns",
            "Subscribe to status webhooks for instant suspend",
            "Implement progressive limits for new agents",
            "Use automated testing requirements for large changes",
          ],
          deprecation: null,
          created_at: "2025-01-30T00:00:00Z",
          updated_at: "2025-01-30T00:00:00Z",
        },
        "messaging.v1": {
          id: "messaging.v1",
          name: "Messaging Protection Policy",
          description:
            "Pre-act governance for messaging operations. Enforces rate limits, channel restrictions, mention policies, and content validation for PLG on-ramp.",
          version: "1.0.0",
          status: "active",
          requires_capabilities: ["messaging.send"],
          min_assurance: "L1",
          limits_required: ["msgs_per_min", "msgs_per_day"],
          required_fields: ["channel_id", "message", "message_type"],
          optional_fields: ["mentions", "attachments", "thread_id", "reply_to"],
          enforcement: {
            channels_allowlist_enforced: true,
            mention_policy_enforced: true,
            rate_limits_enforced: true,
          },
          mcp: {
            require_allowlisted_if_present: true,
          },
          advice: [
            "Implement rate limiting per agent and per channel",
            "Monitor for spam patterns and suspicious activity",
            "Log all message attempts for Verifiable Attestation",
            "Consider implementing channel-specific limits",
            "Use mention policies to prevent @everyone abuse",
            "Subscribe to status webhooks for instant suspend",
            "Implement content filtering for inappropriate messages",
            "Use progressive rate limiting for new agents",
          ],
          deprecation: null,
          created_at: "2025-01-30T00:00:00Z",
          updated_at: "2025-01-30T00:00:00Z",
        },
        "release.v1": {
          id: "release.v1",
          name: "Release Policy",
          description:
            "Pre-act governance for release operations. Enforces version format, file restrictions, and repository permissions.",
          version: "1.0.0",
          status: "active",
          requires_capabilities: ["release"],
          min_assurance: "L3",
          limits_required: [],
          required_fields: ["repository", "version", "files"],
          optional_fields: ["description", "changelog"],
          enforcement: {
            version_format_enforced: true,
            file_restrictions_enforced: true,
            repository_permissions_enforced: true,
          },
          mcp: {
            require_allowlisted_if_present: true,
          },
          advice: [
            "Use semantic versioning for all releases",
            "Restrict file types to prevent malicious uploads",
            "Verify repository permissions before allowing releases",
            "Log all release attempts for audit compliance",
            "Subscribe to status webhooks for instant suspend",
          ],
          deprecation: null,
          created_at: "2025-01-30T00:00:00Z",
          updated_at: "2025-01-30T00:00:00Z",
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
