/**
 * Authentication Utilities
 *
 * JWT handling, session management, and auth-related utilities.
 */

import {
  JWTPayload,
  SessionData,
  RefreshTokenData,
  AuthContext,
  User,
  OrgMember,
  OrgRole,
} from "../../types/auth";
import { AuthEnv } from "../../types/auth";

/**
 * Generate a secure random string
 */
export function generateSecureToken(length: number = 32): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

/**
 * Generate session ID
 */
export function generateSessionId(): string {
  return `sess_${generateSecureToken(24)}`;
}

/**
 * Generate refresh token ID
 */
export function generateRefreshTokenId(): string {
  return `refresh_${generateSecureToken(24)}`;
}

/**
 * Create JWT token
 */
export async function createJWT(
  payload: Omit<JWTPayload, "iat" | "exp">,
  secret: string,
  expiresIn: number = 900 // 15 minutes default
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const jwtPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn,
  };

  // For now, we'll use a simple HMAC-SHA256 approach
  // In production, you might want to use EdDSA for better performance
  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const encodedHeader = btoa(JSON.stringify(header))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const encodedPayload = btoa(JSON.stringify(jwtPayload))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const message = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );
  const encodedSignature = btoa(
    String.fromCharCode(...new Uint8Array(signature))
  )
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${message}.${encodedSignature}`;
}

/**
 * Verify JWT token
 */
export async function verifyJWT(
  token: string,
  secret: string
): Promise<JWTPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;

    // Decode header and payload
    const header = JSON.parse(
      atob(headerB64.replace(/-/g, "+").replace(/_/g, "/"))
    );
    const payload = JSON.parse(
      atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"))
    );

    // Verify signature
    const message = `${headerB64}.${payloadB64}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signature = Uint8Array.from(
      atob(signatureB64.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0)
    );
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      new TextEncoder().encode(message)
    );

    if (!isValid) return null;

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;

    return payload as JWTPayload;
  } catch (error) {
    console.error("JWT verification error:", error);
    return null;
  }
}

/**
 * Create session in KV
 */
export async function createSession(
  kv: KVNamespace,
  user: User,
  provider: string,
  ipAddress: string,
  userAgent: string,
  turnstileVerified: boolean = false
): Promise<{ sessionId: string; refreshTokenId: string }> {
  const sessionId = generateSessionId();
  const refreshTokenId = generateRefreshTokenId();
  const now = new Date().toISOString();

  const sessionData: SessionData = {
    user_id: user.user_id,
    provider: provider as any,
    created_at: now,
    last_used_at: now,
    ip_address: ipAddress,
    user_agent: userAgent,
    turnstile_verified: turnstileVerified,
  };

  const refreshData: RefreshTokenData = {
    user_id: user.user_id,
    session_id: sessionId,
    created_at: now,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    ip_address: ipAddress,
    user_agent: userAgent,
  };

  // Store session and refresh token
  await Promise.all([
    kv.put(`session:${sessionId}`, JSON.stringify(sessionData), {
      expirationTtl: 7 * 24 * 60 * 60, // 7 days
    }),
    kv.put(`refresh:${refreshTokenId}`, JSON.stringify(refreshData), {
      expirationTtl: 7 * 24 * 60 * 60, // 7 days
    }),
  ]);

  return { sessionId, refreshTokenId };
}

/**
 * Get session from KV
 */
export async function getSession(
  kv: KVNamespace,
  sessionId: string
): Promise<SessionData | null> {
  const data = await kv.get(`session:${sessionId}`, "json");
  return data as SessionData | null;
}

/**
 * Get refresh token from KV
 */
export async function getRefreshToken(
  kv: KVNamespace,
  refreshTokenId: string
): Promise<RefreshTokenData | null> {
  const data = await kv.get(`refresh:${refreshTokenId}`, "json");
  return data as RefreshTokenData | null;
}

/**
 * Update session last used timestamp
 */
export async function updateSessionLastUsed(
  kv: KVNamespace,
  sessionId: string
): Promise<void> {
  const session = await getSession(kv, sessionId);
  if (session) {
    session.last_used_at = new Date().toISOString();
    await kv.put(`session:${sessionId}`, JSON.stringify(session), {
      expirationTtl: 7 * 24 * 60 * 60, // 7 days
    });
  }
}

/**
 * Delete session and refresh token
 */
export async function deleteSession(
  kv: KVNamespace,
  sessionId: string,
  refreshTokenId?: string
): Promise<void> {
  const promises = [kv.delete(`session:${sessionId}`)];
  if (refreshTokenId) {
    promises.push(kv.delete(`refresh:${refreshTokenId}`));
  }
  await Promise.all(promises);
}

/**
 * Get user from KV
 */
export async function getUser(
  kv: KVNamespace,
  userId: string
): Promise<User | null> {
  const data = await kv.get(`user:${userId}`, "json");
  return data as User | null;
}

/**
 * Create or update user in KV
 */
export async function createOrUpdateUser(
  kv: KVNamespace,
  userData: Partial<User> & { user_id: string }
): Promise<User> {
  const existing = await getUser(kv, userData.user_id);
  const now = new Date().toISOString();

  // Track previous assurance level if it's changing
  let previousAttestations = existing?.previous_attestations || [];
  if (
    existing &&
    userData.assurance_level &&
    userData.assurance_level !== existing.assurance_level
  ) {
    const previousAttestation = {
      attestation_id: `prev_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 8)}`,
      assurance_level: existing.assurance_level,
      assurance_method: existing.assurance_method || "self_attested",
      assurance_verified_at: existing.assurance_verified_at || now,
      attested_at: now,
      attested_by: "system",
      attested_reason: "Assurance level updated",
      attested_evidence: {
        type: "previous_level",
        value: existing.assurance_level,
        verified_at: existing.assurance_verified_at || now,
        metadata: {
          previous_method: existing.assurance_method || "self_attested",
        },
      },
      status: "verified" as const,
      previous_assurance_level: existing.assurance_level,
    };

    previousAttestations = [...previousAttestations, previousAttestation];
  }

  const user: User = {
    ...existing,
    ...userData,
    created_at: existing?.created_at || now,
    updated_at: now,
    assurance_level:
      userData.assurance_level || existing?.assurance_level || "L0",
    previous_attestations: previousAttestations,
  };

  await kv.put(`user:${user.user_id}`, JSON.stringify(user));
  return user;
}

/**
 * Get user's organization roles
 */
export async function getUserOrgRoles(
  kv: KVNamespace,
  userId: string
): Promise<Record<string, OrgRole[]>> {
  // Get all org memberships for this user
  const orgMemberships = (await kv.get(`user_orgs:${userId}`, "json")) as
    | OrgMember[]
    | null;
  if (!orgMemberships) return {};

  const roles: Record<string, OrgRole[]> = {};
  for (const membership of orgMemberships) {
    if (!roles[membership.org_id]) {
      roles[membership.org_id] = [];
    }
    roles[membership.org_id].push(membership.role as OrgRole);
  }

  return roles;
}

/**
 * Create auth context for middleware
 */
export async function createAuthContext(
  kv: KVNamespace,
  user: User,
  session: SessionData
): Promise<AuthContext> {
  const orgRoles = await getUserOrgRoles(kv, user.user_id);

  return {
    user,
    session,
    org_roles: orgRoles,
    platform_roles: [], // TODO: Implement platform roles
  };
}

/**
 * Generate secure state parameter for OAuth
 */
export function generateOAuthState(): string {
  return generateSecureToken(32);
}

/**
 * Verify OAuth state parameter
 */
export function verifyOAuthState(
  state: string,
  expectedState: string
): boolean {
  return state === expectedState;
}

/**
 * Get client IP address from request
 */
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }

  return "unknown";
}

/**
 * Get user agent from request
 */
export function getUserAgent(request: Request): string {
  return request.headers.get("user-agent") || "unknown";
}

/**
 * Create secure cookies
 */
export function createAuthCookies(
  accessToken: string,
  refreshTokenId: string,
  domain?: string,
  isLocalDev: boolean = false
): { accessToken: string; refreshToken: string } {
  const cookieOptions = [
    "HttpOnly",
    // Only use Secure flag in production (not local development)
    ...(isLocalDev ? [] : ["Secure"]),
    "SameSite=Lax",
    domain ? `Domain=${domain}` : "",
  ]
    .filter(Boolean)
    .join("; ");

 return {
    accessToken: `access_token=${accessToken}; ${cookieOptions}; Max-Age=900; Path=/`, // 15 minutes
    refreshToken: `refresh_token=${refreshTokenId}; ${cookieOptions}; Max-Age=604800; Path=/`, // 7 days
  };
}

/**
 * Clear auth cookies
 */
export function clearAuthCookies(domain?: string): {
  accessToken: string;
  refreshToken: string;
} {
  const cookieOptions = [
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    domain ? `Domain=${domain}` : "",
  ]
    .filter(Boolean)
    .join("; ");

  return {
    accessToken: `access_token=; ${cookieOptions}; Max-Age=0; Path=/`,
    refreshToken: `refresh_token=; ${cookieOptions}; Max-Age=0; Path=/`,
  };
}
