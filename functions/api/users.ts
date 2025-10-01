import {
  BaseApiHandler,
  BaseEnv,
  createApiHandler,
} from "../utils/base-api-handler";
import { cors } from "../utils/cors";
import { User, CreateUserRequest } from "../../types/owner";
import {
  AttestationService,
  getAttestationConfig,
  createEvidenceForType,
} from "../utils/attestation-service";

interface Env extends BaseEnv {}

/**
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - user_id
 *         - email
 *         - display_name
 *         - created_at
 *         - updated_at
 *         - assurance_level
 *       properties:
 *         user_id:
 *           type: string
 *           description: Unique identifier for the user
 *           example: "ap_user_12345678"
 *         email:
 *           type: string
 *           format: email
 *           description: User's email address
 *           example: "user@example.com"
 *         display_name:
 *           type: string
 *           description: User's display name
 *           example: "John Doe"
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: ISO timestamp when user was created
 *           example: "2025-01-15T10:30:00Z"
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: ISO timestamp when user was last updated
 *           example: "2025-01-15T10:30:00Z"
 *         assurance_level:
 *           type: string
 *           enum: [L0, L1, L2, L3, L4KYC, L4FIN]
 *           description: User's assurance level
 *           example: "L0"
 *         assurance_method:
 *           type: string
 *           enum: [self, email, github, domain, kyc, kyb, financial_data]
 *           description: Method used for assurance verification
 *           example: "email"
 *         assurance_verified_at:
 *           type: string
 *           format: date-time
 *           description: ISO timestamp when assurance was verified
 *           example: "2025-01-15T10:30:00Z"
 *     CreateUserRequest:
 *       type: object
 *       required:
 *         - email
 *         - display_name
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: User's email address
 *           example: "user@example.com"
 *         display_name:
 *           type: string
 *           description: User's display name
 *           example: "John Doe"
 */

/**
 * /api/users:
 *   post:
 *     summary: Create a new user
 *     description: Creates a new user record in the system
 *     operationId: createUser
 *     tags:
 *       - Users
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateUserRequest'
 *           example:
 *             email: "user@example.com"
 *             display_name: "John Doe"
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *             example:
 *               user_id: "ap_user_12345678"
 *               email: "user@example.com"
 *               display_name: "John Doe"
 *               created_at: "2025-01-15T10:30:00Z"
 *               updated_at: "2025-01-15T10:30:00Z"
 *               assurance_level: "L0"
 *       400:
 *         description: Bad request - invalid input
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "invalid_email"
 *                 message:
 *                   type: string
 *                   example: "Invalid email format"
 *       409:
 *         description: Conflict - user already exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "user_exists"
 *                 message:
 *                   type: string
 *                   example: "User with this email already exists"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "internal_server_error"
 *                 message:
 *                   type: string
 *                   example: "Failed to create user"
 */

class CreateUserHandler extends BaseApiHandler {
  async handleRequest(): Promise<Response> {
    const body: CreateUserRequest = await this.request.json();

    // Validate required fields
    const validationError = this.validateRequiredFields(body, [
      "email",
      "display_name",
    ]);
    if (validationError) return validationError;

    // Validate email format
    const emailError = this.validateEmail(body.email);
    if (emailError) return emailError;

    // Generate user ID
    const user_id = `ap_user_${Math.random().toString(36).substr(2, 8)}`;

    // Check if user already exists
    const existingUser = await this.env.ai_passport_registry.get(
      `user:${user_id}`,
      "json"
    );
    if (existingUser) {
      return this.conflict("User with this ID already exists");
    }

    // Check if email is already taken
    const emailKey = `user_email:${body.email}`;
    const existingEmail = await this.env.ai_passport_registry.get(
      emailKey,
      "json"
    );
    if (existingEmail) {
      return this.conflict("User with this email already exists");
    }

    // Create user record
    const now = new Date().toISOString();
    const user: User = {
      user_id,
      email: body.email,
      display_name: body.display_name,
      created_at: now,
      updated_at: now,
      assurance_level: "L0",
    };

    // Store user record
    await this.env.ai_passport_registry.put(
      `user:${user_id}`,
      JSON.stringify(user)
    );

    // Store email index for lookup
    await this.env.ai_passport_registry.put(
      emailKey,
      JSON.stringify({ user_id })
    );

    return this.created(user, "User created successfully");
  }
}

class UpdateUserHandler extends BaseApiHandler {
  async handleRequest(): Promise<Response> {
    const body: Partial<User> & { user_id: string } = await this.request.json();

    // Validate required fields
    const validationError = this.validateRequiredFields(body, ["user_id"]);
    if (validationError) return validationError;

    // Get existing user
    const existingUser = (await this.env.ai_passport_registry.get(
      `user:${body.user_id}`,
      "json"
    )) as User | null;

    if (!existingUser) {
      return this.notFound("User not found");
    }

    // If assurance level is being updated, use attestation service
    if (
      body.assurance_level &&
      body.assurance_level !== existingUser.assurance_level
    ) {
      try {
        const attestationConfig = getAttestationConfig(this.env);
        const evidence = createEvidenceForType(
          "platform_verification",
          body.user_id,
          {
            updated_by: "user_profile_update",
            previous_level: existingUser.assurance_level,
            new_level: body.assurance_level,
          }
        );

        const attestationService = new AttestationService(
          this.env.ai_passport_registry,
          attestationConfig,
          this.env.AP_VERSION
        );

        // Create and verify attestation
        const attestation = await attestationService.createAttestation(
          {
            type: "platform_verification",
            subject_id: body.user_id,
            subject_type: "user",
            evidence,
            verified_by: "user_profile_update",
            comment: `User profile assurance level update from ${existingUser.assurance_level} to ${body.assurance_level}`,
            expires_at: new Date(
              Date.now() + 30 * 24 * 60 * 60 * 1000
            ).toISOString(), // 30 days
          },
          {
            APP_BASE_URL: this.env.APP_BASE_URL,
            CLOUDFLARE_API_TOKEN: this.env.CLOUDFLARE_API_TOKEN,
            CLOUDFLARE_ZONE_ID: this.env.CLOUDFLARE_ZONE_ID,
          }
        );

        const verificationResult = await attestationService.verifyEvidence(
          {
            attestation_id: attestation.attestation_id,
            evidence: {
              ...evidence,
              verified_at: new Date().toISOString(),
            },
            verified_by: "user_profile_update",
            comment: `User profile assurance level update from ${existingUser.assurance_level} to ${body.assurance_level}`,
          },
          {
            APP_BASE_URL: this.env.APP_BASE_URL,
            CLOUDFLARE_API_TOKEN: this.env.CLOUDFLARE_API_TOKEN,
            CLOUDFLARE_ZONE_ID: this.env.CLOUDFLARE_ZONE_ID,
          }
        );

        if (verificationResult.valid) {
          console.log(
            `[Users API] Updated user ${body.user_id} assurance level to ${verificationResult.attestation?.assurance_level}`
          );
        } else {
          console.warn(
            `[Users API] Failed to verify attestation: ${verificationResult.error}`
          );
        }
      } catch (error) {
        console.error("Error updating assurance level:", error);
        // Continue with manual update if attestation service fails
      }
    }

    // Update user record
    const updatedUser: User = {
      ...existingUser,
      ...body,
      updated_at: new Date().toISOString(),
    };

    // Store updated user record
    await this.env.ai_passport_registry.put(
      `user:${updatedUser.user_id}`,
      JSON.stringify(updatedUser)
    );

    return this.ok(updatedUser, "User updated successfully");
  }
}

// Export handlers
export const onRequestOptions = async ({ request }: { request: Request }) =>
  new Response(null, { headers: cors(request) });

export const onRequestPost = createApiHandler(CreateUserHandler, {
  allowedMethods: ["POST"],
  requireAuth: false,
  rateLimitRpm: 30,
  rateLimitType: "org",
});

export const onRequestPut = createApiHandler(UpdateUserHandler, {
  allowedMethods: ["PUT"],
  requireAuth: true,
  rateLimitRpm: 60,
  rateLimitType: "org",
});
