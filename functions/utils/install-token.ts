import { KVNamespace } from "@cloudflare/workers-types";

interface Env {
  ai_passport_registry: KVNamespace;
  APORT_JWT_SECRET?: string;
}

export interface InstallTokenPayload {
  template_id: string;
  platform_id: string;
  tenant_ref: string;
  controller_hint?: string;
  return_url?: string;
  brand?: {
    logo?: string;
    background_color?: string;
    foreground_color?: string;
  };
  nonce: string;
  iat: number;
  nbf: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface VerifiedInstallToken extends InstallTokenPayload {
  valid: true;
}

export interface InvalidInstallToken {
  valid: false;
  error: string;
}

export type InstallTokenResult = VerifiedInstallToken | InvalidInstallToken;

export async function verifyInstallToken(
  token: string,
  env: Env
): Promise<InstallTokenResult> {
  try {
    // Parse token
    const [payloadB64, signature] = token.split(".");
    if (!payloadB64 || !signature) {
      return {
        valid: false,
        error: "Invalid token format",
      };
    }

    // Decode payload
    const payload: InstallTokenPayload = JSON.parse(
      atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"))
    );

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (now > payload.exp) {
      return {
        valid: false,
        error: "Token expired",
      };
    }

    // Check not before
    if (now < payload.nbf) {
      return {
        valid: false,
        error: "Token not yet valid",
      };
    }

    // Verify signature using Web Crypto API
    const secret = env.APORT_JWT_SECRET || "default-secret";
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const expectedSignature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(JSON.stringify(payload))
    );

    const expectedSignatureHex = Array.from(new Uint8Array(expectedSignature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (signature !== expectedSignatureHex) {
      return {
        valid: false,
        error: "Invalid signature",
      };
    }

    // Check if token has been used (check KV store)
    try {
      const storedToken = await env.ai_passport_registry.get(
        `install_token:${payload.nonce}`,
        "json"
      );

      if (!storedToken) {
        return {
          valid: false,
          error: "Token not found or already used",
        };
      }

      // Verify stored token matches
      if ((storedToken as any).signature !== signature) {
        return {
          valid: false,
          error: "Token signature mismatch",
        };
      }
    } catch (error) {
      return {
        valid: false,
        error: "Token verification failed",
      };
    }

    // Verify issuer and audience
    if (payload.iss !== "aport.io" || payload.aud !== "platform-install") {
      return {
        valid: false,
        error: "Invalid issuer or audience",
      };
    }

    return {
      ...payload,
      valid: true,
    };
  } catch (error) {
    return {
      valid: false,
      error: "Token parsing failed",
    };
  }
}

export async function markTokenAsUsed(
  token: string,
  env: Env
): Promise<boolean> {
  try {
    // First verify the token to get the nonce
    const result = await verifyInstallToken(token, env);
    if (!result.valid) {
      console.error("Cannot mark invalid token as used:", result.error);
      return false;
    }

    // Remove token from KV store to prevent reuse
    await env.ai_passport_registry.delete(`install_token:${result.nonce}`);
    return true;
  } catch (error) {
    console.error("Failed to mark token as used:", error);
    return false;
  }
}

export function isTokenExpired(payload: InstallTokenPayload): boolean {
  const now = Math.floor(Date.now() / 1000);
  return now > payload.exp;
}

export function getTokenTimeRemaining(payload: InstallTokenPayload): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.max(0, payload.exp - now);
}
