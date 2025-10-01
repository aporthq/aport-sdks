/**
 * Taxonomy API Endpoint
 *
 * Provides controlled enums for categories and frameworks
 * with display metadata for UI components.
 */

import { cors } from "../../utils/cors";
import { getDisplayData, generateBadgeData } from "../../utils/taxonomy";
import { PagesFunction } from "@cloudflare/workers-types";

interface Env {
  ai_passport_registry: any;
}

/**
 * @swagger
 * /api/taxonomy:
 *   get:
 *     summary: Get taxonomy data
 *     description: Retrieve controlled enums for categories and frameworks with display metadata
 *     operationId: getTaxonomy
 *     tags:
 *       - Taxonomy
 *     responses:
 *       200:
 *         description: Taxonomy data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         enum: ["support", "commerce", "devops", "ops", "analytics", "marketing"]
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       color:
 *                         type: string
 *                       icon:
 *                         type: string
 *                       order:
 *                         type: number
 *                       capabilities:
 *                         type: array
 *                         items:
 *                           type: string
 *                 frameworks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         enum: ["n8n", "LangGraph", "CrewAI", "AutoGen", "OpenAI", "LlamaIndex", "Custom"]
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       color:
 *                         type: string
 *                       icon:
 *                         type: string
 *                       website:
 *                         type: string
 *                       order:
 *                         type: number
 *                       capabilities:
 *                         type: array
 *                         items:
 *                           type: string
 *             example:
 *               categories:
 *                 - id: "support"
 *                   name: "Support"
 *                   description: "Customer support and helpdesk automation"
 *                   color: "#3B82F6"
 *                   icon: "headset"
 *                   order: 1
 *                   capabilities: ["messaging.send", "crm.update", "data.export"]
 *               frameworks:
 *                 - id: "n8n"
 *                   name: "n8n"
 *                   description: "Workflow automation platform"
 *                   color: "#FF6D5A"
 *                   icon: "workflow"
 *                   website: "https://n8n.io"
 *                   order: 1
 *                   capabilities: ["*"]
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const onRequestOptions: PagesFunction<Env> = async ({ request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const headers = cors(request);

  try {
    // Get display data for UI components
    const taxonomyData = getDisplayData();

    const response = new Response(JSON.stringify(taxonomyData), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=3600, s-maxage=86400", // Cache for 1 hour, CDN for 24 hours
        ...headers,
      },
    });

    return response;
  } catch (error) {
    console.error("Taxonomy API Error:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to retrieve taxonomy data",
      }),
      {
        status: 500,
        headers: {
          "content-type": "application/json",
          ...headers,
        },
      }
    );

    return response;
  }
};

/**
 * @swagger
 * /api/taxonomy/badges:
 *   get:
 *     summary: Get badge data for specific categories and frameworks
 *     description: Generate badge display data for AgentCard components
 *     operationId: getTaxonomyBadges
 *     tags:
 *       - Taxonomy
 *     parameters:
 *       - name: categories
 *         in: query
 *         description: Comma-separated list of category IDs
 *         required: false
 *         schema:
 *           type: string
 *           example: "support,commerce"
 *       - name: frameworks
 *         in: query
 *         description: Comma-separated list of framework IDs
 *         required: false
 *         schema:
 *           type: string
 *           example: "n8n,LangGraph"
 *     responses:
 *       200:
 *         description: Badge data generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: object
 *                 frameworks:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Invalid taxonomy values
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const onRequestGetBadges: PagesFunction<Env> = async ({
  request,
  env,
}) => {
  const headers = cors(request);
  const url = new URL(request.url);

  try {
    const categoriesParam = url.searchParams.get("categories");
    const frameworksParam = url.searchParams.get("frameworks");

    const categories = categoriesParam ? categoriesParam.split(",") : [];
    const frameworks = frameworksParam ? frameworksParam.split(",") : [];

    // Validate categories and frameworks
    const { validateCategories, validateFrameworks } = await import(
      "../../utils/taxonomy"
    );

    const categoryValidation = validateCategories(categories);
    const frameworkValidation = validateFrameworks(frameworks);

    if (!categoryValidation.valid || !frameworkValidation.valid) {
      const errors: string[] = [];
      if (!categoryValidation.valid) errors.push(...categoryValidation.errors);
      if (!frameworkValidation.valid)
        errors.push(...frameworkValidation.errors);

      const response = new Response(
        JSON.stringify({
          error: "invalid_taxonomy",
          message: "Invalid taxonomy values provided",
          errors: errors,
        }),
        {
          status: 400,
          headers: {
            "content-type": "application/json",
            ...headers,
          },
        }
      );

      return response;
    }

    // Generate badge data
    const badgeData = generateBadgeData(
      categories as any[], // Type assertion for controlled enums
      frameworks as any[]
    );

    const response = new Response(JSON.stringify(badgeData), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=3600, s-maxage=86400",
        ...headers,
      },
    });

    return response;
  } catch (error) {
    console.error("Taxonomy Badges API Error:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to generate badge data",
      }),
      {
        status: 500,
        headers: {
          "content-type": "application/json",
          ...headers,
        },
      }
    );

    return response;
  }
};
