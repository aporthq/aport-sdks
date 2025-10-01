/**
 * Assurance API Endpoint
 *
 * Provides assurance level management and verification for owners
 * with performance optimizations for edge computing.
 */

import { cors } from "../../utils/cors";
import {
  getAssuranceLevelsSorted,
  getAssuranceDisplayData,
  generateAssuranceBadgeData,
  validateAssuranceLevel,
  validateAssuranceMethod,
  createOwnerAssurance,
  updateOwnerAssurance,
  isAssuranceExpired,
} from "../../utils/assurance";
import { PagesFunction } from "@cloudflare/workers-types";

interface Env {
  ai_passport_registry: any;
}

/**
 * @swagger
 * /api/assurance:
 *   get:
 *     summary: Get assurance levels
 *     description: Retrieve all available assurance levels with metadata
 *     operationId: getAssuranceLevels
 *     tags:
 *       - Assurance
 *     responses:
 *       200:
 *         description: Assurance levels retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 levels:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       level:
 *                         type: string
 *                         enum: ["L0", "L1", "L2", "L3", "L4KYC", "L4FIN"]
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       requirements:
 *                         type: array
 *                         items:
 *                           type: string
 *                       verificationMethods:
 *                         type: array
 *                         items:
 *                           type: string
 *                       riskLevel:
 *                         type: string
 *                         enum: ["low", "medium", "high", "very_high"]
 *                       order:
 *                         type: number
 *                       color:
 *                         type: string
 *                       icon:
 *                         type: string
 *             example:
 *               levels:
 *                 - level: "L0"
 *                   name: "Self-Attested"
 *                   description: "Owner self-declares identity without verification"
 *                   requirements: ["Self-declaration"]
 *                   verificationMethods: ["self_attested"]
 *                   riskLevel: "very_high"
 *                   order: 0
 *                   color: "#EF4444"
 *                   icon: "warning"
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
    // Get all assurance levels with metadata
    const levels = getAssuranceLevelsSorted().map((level) =>
      getAssuranceDisplayData(level)
    );

    const response = new Response(JSON.stringify({ levels }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=3600, s-maxage=86400", // Cache for 1 hour, CDN for 24 hours
        ...headers,
      },
    });

    return response;
  } catch (error) {
    console.error("Assurance API Error:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to retrieve assurance levels",
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
 * /api/assurance/validate:
 *   post:
 *     summary: Validate assurance level and method
 *     description: Validate assurance level and method combinations
 *     operationId: validateAssurance
 *     tags:
 *       - Assurance
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               level:
 *                 type: string
 *                 description: Assurance level to validate
 *               method:
 *                 type: string
 *                 description: Assurance method to validate
 *             required:
 *               - level
 *               - method
 *     responses:
 *       200:
 *         description: Validation successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                 level:
 *                   type: string
 *                 method:
 *                   type: string
 *       400:
 *         description: Validation failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const headers = cors(request);

  try {
    const body = (await request.json()) as { level?: string; method?: string };
    const { level, method } = body;

    if (!level || !method) {
      return new Response(
        JSON.stringify({
          valid: false,
          errors: ["Level and method are required"],
        }),
        {
          status: 400,
          headers: {
            "content-type": "application/json",
            ...headers,
          },
        }
      );
    }

    const levelValidation = validateAssuranceLevel(level);
    const methodValidation = validateAssuranceMethod(method);

    if (!levelValidation.valid || !methodValidation.valid) {
      const errors: string[] = [];
      if (!levelValidation.valid) errors.push(levelValidation.error!);
      if (!methodValidation.valid) errors.push(methodValidation.error!);

      return new Response(
        JSON.stringify({
          valid: false,
          errors,
        }),
        {
          status: 400,
          headers: {
            "content-type": "application/json",
            ...headers,
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        valid: true,
        level: levelValidation.level,
        method: methodValidation.method,
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          ...headers,
        },
      }
    );
  } catch (error) {
    console.error("Assurance Validation API Error:", error);

    const response = new Response(
      JSON.stringify({
        error: "internal_server_error",
        message: "Failed to validate assurance",
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
