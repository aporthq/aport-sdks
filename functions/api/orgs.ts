import {
  BaseApiHandler,
  BaseEnv,
  createApiHandler,
} from "../utils/base-api-handler";
import { cors } from "../utils/cors";
import { CreateOrgRequest } from "../../types/owner";
import {
  EnhancedOrg,
  ManageMemberRequest,
  OrgMembership,
} from "../../types/auth";
import { createOrganization } from "../utils/org-management";
import { authMiddleware, AuthResult } from "../utils/auth-middleware";
import { createAuditAction, completeAuditAction } from "../utils/audit-trail";

interface Env extends BaseEnv {
  JWT_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_REDIRECT_URI: string;
  EMAIL_FROM: string;
  REGISTRY_PRIVATE_KEY?: string;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Organization:
 *       type: object
 *       required:
 *         - org_id
 *         - name
 *         - contact_email
 *         - members
 *         - created_at
 *         - updated_at
 *         - assurance_level
 *       properties:
 *         org_id:
 *           type: string
 *           description: Unique identifier for the organization
 *           example: "ap_org_12345678"
 *         name:
 *           type: string
 *           description: Organization name
 *           example: "Acme Corp"
 *         domain:
 *           type: string
 *           description: Organization domain (optional)
 *           example: "acme.com"
 *         contact_email:
 *           type: string
 *           format: email
 *           description: Organization contact email
 *           example: "admin@acme.com"
 *         members:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               user_id:
 *                 type: string
 *                 example: "ap_user_12345678"
 *               role:
 *                 type: string
 *                 enum: [admin, member]
 *                 example: "admin"
 *               added_at:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-01-15T10:30:00Z"
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: ISO timestamp when org was created
 *           example: "2025-01-15T10:30:00Z"
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: ISO timestamp when org was last updated
 *           example: "2025-01-15T10:30:00Z"
 *         assurance_level:
 *           type: string
 *           enum: [L0, L1, L2, L3, L4KYC, L4FIN]
 *           description: Organization's assurance level
 *           example: "L0"
 *         assurance_method:
 *           type: string
 *           enum: [self, email, github, domain, kyc, kyb, financial_data]
 *           description: Method used for assurance verification
 *           example: "domain"
 *         assurance_verified_at:
 *           type: string
 *           format: date-time
 *           description: ISO timestamp when assurance was verified
 *           example: "2025-01-15T10:30:00Z"
 *     CreateOrgRequest:
 *       type: object
 *       required:
 *         - name
 *         - contact_email
 *       properties:
 *         name:
 *           type: string
 *           description: Organization name
 *           example: "Acme Corp"
 *         domain:
 *           type: string
 *           description: Organization domain (optional)
 *           example: "acme.com"
 *         contact_email:
 *           type: string
 *           format: email
 *           description: Organization contact email
 *           example: "admin@acme.com"
 *     AddMemberRequest:
 *       type: object
 *       required:
 *         - user_id
 *         - role
 *       properties:
 *         user_id:
 *           type: string
 *           description: User ID to add as member
 *           example: "ap_user_12345678"
 *         role:
 *           type: string
 *           enum: [admin, member]
 *           description: Member role
 *           example: "admin"
 */

/**
 * @swagger
 * /api/orgs:
 *   post:
 *     summary: Create a new organization
 *     description: Creates a new organization record in the system
 *     operationId: createOrg
 *     tags:
 *       - Organizations
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateOrgRequest'
 *           example:
 *             name: "Acme Corp"
 *             domain: "acme.com"
 *             contact_email: "admin@acme.com"
 *     responses:
 *       201:
 *         description: Organization created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Organization'
 *       400:
 *         description: Bad request - invalid input
 *       409:
 *         description: Conflict - organization already exists
 *       500:
 *         description: Internal server error
 */

class CreateOrgHandler extends BaseApiHandler {
  async handleRequest(): Promise<Response> {
    console.log({ request: this.request });
    // Authenticate user (allow both JWT and API key)
    const authResult = await authMiddleware(this.request, this.env as any, {
      requireAuth: true,
      allowApiKey: true,
      requiredApiKeyScopes: ["read"],
    });
    console.log({ authResult });

    if (!authResult.success || !authResult.user) {
      return this.response.unauthorized(
        authResult.error || "Authentication required"
      );
    }

    const body: CreateOrgRequest = await this.request.json();

    // Validate required fields
    const validationError = this.validateRequiredFields(body, [
      "name",
      "contact_email",
    ]);
    if (validationError) return validationError;

    // Validate email format
    const emailError = this.validateEmail(body.contact_email);
    if (emailError) return emailError;

    try {
      // Security: Check if user can create organizations
      // For now, any authenticated user can create organizations
      // In the future, this could be restricted based on platform roles or limits
      const userId = authResult.user.user.user_id;

      // Log organization creation for security auditing
      console.log(`User ${userId} creating organization: ${body.name}`);

      // Create organization using utility function
      const org = await createOrganization(
        this.env.ai_passport_registry,
        body.name,
        body.contact_email,
        userId,
        body.domain
      );

      // Audit the organization creation
      const auditData = await createAuditAction(
        "create",
        org.org_id,
        authResult.user.user.user_id,
        {
          organization_created: {
            from: null,
            to: {
              org_id: org.org_id,
              org_name: org.name,
              contact_email: org.contact_email,
              domain: org.domain,
            },
          },
        },
        "Organization created",
        {
          org_name: org.name,
          contact_email: org.contact_email,
          domain: org.domain,
        }
      );

      await completeAuditAction(auditData, null, this.env.REGISTRY_PRIVATE_KEY);

      return this.created(org, "Organization created successfully");
    } catch (error) {
      console.error("Error creating organization:", error);
      return this.internalError("Failed to create organization");
    }
  }
}

// Export handlers
export const onRequestOptions = async ({ request }: { request: Request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestGet = async ({
  request,
  env,
}: {
  request: Request;
  env: Env;
}) => {
  // Authenticate user (allow both JWT and API key)
  const authResult = await authMiddleware(request, env, {
    requireAuth: true,
    allowApiKey: true,
    requiredApiKeyScopes: ["read"],
  });

  if (!authResult.success || !authResult.user) {
    return new Response(
      JSON.stringify({ error: authResult.error || "Authentication required" }),
      {
        status: 401,
        headers: {
          ...cors(request),
          "Content-Type": "application/json",
        },
      }
    );
  }

  try {
    // Get user ID from auth context
    const userId = authResult.user.user.user_id;

    // Security: Log organization access for auditing
    console.log(`User ${userId} accessing organization list`);

    // Fetch all user memberships
    const membershipKeys = await env.ai_passport_registry.list({
      prefix: `membership:org:${userId}`,
    });

    // Also check for memberships with the correct pattern
    const allMembershipKeys = await env.ai_passport_registry.list({
      prefix: "membership:org:",
    });

    const userMemberships = allMembershipKeys.keys.filter((key) =>
      key.name.endsWith(`:${userId}`)
    );

    const organizations: EnhancedOrg[] = [];

    // Process each membership
    for (const membershipKey of userMemberships) {
      try {
        // Extract org ID from membership key (membership:org:ORG_ID:USER_ID)
        const keyParts = membershipKey.name.split(":");
        const orgId = keyParts[2];

        // Get organization data
        const orgData = (await env.ai_passport_registry.get(
          `org:${orgId}`,
          "json"
        )) as EnhancedOrg;
        if (orgData) {
          // Get membership details
          const membershipData = (await env.ai_passport_registry.get(
            membershipKey.name,
            "json"
          )) as OrgMembership;

          // Get all members for this organization
          const allMemberships = await env.ai_passport_registry.list({
            prefix: `membership:org:${orgId}:`,
          });

          const members = [];
          for (const memberKey of allMemberships.keys) {
            const memberData = await env.ai_passport_registry.get(
              memberKey.name,
              "json"
            );
            if (memberData) {
              members.push(memberData);
            }
          }

          // Convert to EnhancedOrg format
          const enhancedOrg: EnhancedOrg = {
            org_id: orgData.org_id,
            name: orgData.name,
            domain: orgData.domain,
            contact_email: orgData.contact_email,
            members: members as OrgMembership[],
            created_at: orgData.created_at,
            updated_at: orgData.updated_at,
            assurance_level: orgData.assurance_level || "L0",
            // assurance_method: orgData.assurance_method,
            // assurance_verified_at: orgData.assurance_verified_at,
            can_issue_for_others: orgData.can_issue_for_others || false,
            // Add user's role in this organization
            user_role: membershipData?.role || "member",
            org_key_id: orgData.org_key_id,
            org_key_hash: orgData.org_key_hash,
            status: orgData.status || "active",
          };

          organizations.push(enhancedOrg);
        }
      } catch (error) {
        console.error(
          `Error processing organization membership ${membershipKey.name}:`,
          error
        );
        // Continue processing other memberships
      }
    }

    return new Response(
      JSON.stringify({
        organizations,
        count: organizations.length,
      }),
      {
        status: 200,
        headers: {
          ...cors(request),
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("List organizations error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to list organizations" }),
      {
        status: 500,
        headers: {
          ...cors(request),
          "Content-Type": "application/json",
        },
      }
    );
  }
};

export const onRequestPost = createApiHandler(CreateOrgHandler, {
  allowedMethods: ["POST"],
  requireAuth: true,
  rateLimitRpm: 30,
  rateLimitType: "org",
});
