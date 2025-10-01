import { cors } from "../../../utils/cors";
import { createLogger } from "../../../utils/logger";
import {
  listTemplateInstances,
  isTemplateId,
} from "../../../utils/template-instance";
import { ApiResponse, HTTP_STATUS } from "../../../utils/api-response";
import { KVNamespace, PagesFunction } from "@cloudflare/workers-types";

/**
 * @swagger
 * /api/passports/{template_id}/instances:
 *   get:
 *     summary: List instances of a template passport
 *     description: Get a paginated list of all instances created from a template
 *     operationId: listPassportInstances
 *     tags:
 *       - Passports
 *     parameters:
 *       - in: path
 *         name: template_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Template passport ID
 *         example: "agt_tmpl_abc123"
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Pagination cursor
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of instances to return
 *     responses:
 *       200:
 *         description: List of instances
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 instances:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       instance_id:
 *                         type: string
 *                         example: "agt_inst_def456"
 *                       platform_id:
 *                         type: string
 *                         example: "gorgias"
 *                       tenant_ref:
 *                         type: string
 *                         example: "tenant_123"
 *                       controller_id:
 *                         type: string
 *                         example: "ap_org_456"
 *                       controller_type:
 *                         type: string
 *                         example: "org"
 *                       status:
 *                         type: string
 *                         example: "active"
 *                       created_at:
 *                         type: string
 *                         example: "2025-01-15T10:30:00Z"
 *                       updated_at:
 *                         type: string
 *                         example: "2025-01-15T10:30:00Z"
 *                 next_cursor:
 *                   type: string
 *                   description: Cursor for next page
 *                 total_count:
 *                   type: integer
 *                   description: Total number of instances
 *       400:
 *         description: Invalid template ID
 *       404:
 *         description: Template not found
 *       500:
 *         description: Internal server error
 */
export const onRequestOptions: PagesFunction<{
  ai_passport_registry: KVNamespace;
}> = async (context) => {
  const { request } = context;
  const corsHeaders = cors(request);

  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
};

export const onRequestGet: PagesFunction<{
  ai_passport_registry: KVNamespace;
}> = async (context) => {
  const { request, env, params } = context;
  const templateId = params.template_id as string;
  const logger = createLogger(env.ai_passport_registry as KVNamespace);

  // CORS headers
  const corsHeaders = cors(request);

  // Initialize response handler
  const response = new ApiResponse(corsHeaders, env.ai_passport_registry);

  try {
    // Validate template ID format
    if (!isTemplateId(templateId)) {
      return response.badRequest(
        "Invalid template ID format. Must start with 'agt_tmpl_'"
      );
    }

    // Get query parameters
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") || undefined;
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") || "20"),
      100
    );

    // Check if template exists
    const templateKey = `passport:${templateId}`;
    const templateData = await env.ai_passport_registry.get(
      templateKey,
      "json"
    );

    if (!templateData) {
      return response.error(
        {
          error: "not_found",
          message: "Template not found",
        },
        404
      );
    }

    // Get instances with pagination
    const { instanceIds, nextCursor } = await listTemplateInstances(
      env.ai_passport_registry as KVNamespace,
      templateId,
      cursor
    );

    // Limit results
    const limitedInstanceIds = instanceIds.slice(0, limit);

    // Get instance details
    const instances = await Promise.all(
      limitedInstanceIds.map(async (instanceId) => {
        try {
          const instanceKey = `passport:${instanceId}`;
          const instanceData = await env.ai_passport_registry.get(
            instanceKey,
            "json"
          );

          if (!instanceData) {
            return null;
          }

          return {
            instance_id: (instanceData as any).agent_id,
            platform_id: (instanceData as any).platform_id,
            tenant_ref: (instanceData as any).tenant_ref,
            controller_id: (instanceData as any).controller_id,
            controller_type: (instanceData as any).controller_type,
            status: (instanceData as any).status,
            created_at: (instanceData as any).created_at,
            updated_at: (instanceData as any).updated_at,
          };
        } catch (error) {
          console.warn("Failed to get instance data", {
            instanceId,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      })
    );

    // Filter out null results
    const validInstances = instances.filter(Boolean);

    console.log("Listed instances", {
      template_id: templateId,
      count: validInstances.length,
      has_next: !!nextCursor,
    });

    return response.success(
      {
        instances: validInstances,
        next_cursor: nextCursor,
        total_count: validInstances.length,
      },
      200,
      "Instances retrieved successfully"
    );
  } catch (error) {
    console.error("Error listing instances", {
      error: error instanceof Error ? error.message : String(error),
    });
    const errorResponse = new ApiResponse(
      corsHeaders,
      env.ai_passport_registry
    );
    return errorResponse.error(
      {
        error: "internal_server_error",
        message: "Internal server error",
      },
      500
    );
  }
};
