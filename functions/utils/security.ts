/**
 * Security Utilities
 *
 * Additional security measures for authentication and API protection.
 */

/**
 * Validate token format and basic security checks
 */
export function validateTokenFormat(token: string): boolean {
  if (!token || typeof token !== "string") {
    return false;
  }

  // Check JWT format (3 parts separated by dots)
  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }

  // Check each part is base64url encoded
  for (const part of parts) {
    if (!/^[A-Za-z0-9_-]+$/.test(part)) {
      return false;
    }
  }

  return true;
}

/**
 * Sanitize user input to prevent XSS
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== "string") {
    return "";
  }

  return input
    .replace(/[<>]/g, "") // Remove < and >
    .replace(/javascript:/gi, "") // Remove javascript: protocol
    .replace(/on\w+=/gi, "") // Remove event handlers
    .trim();
}

/**
 * Generate secure random string for tokens
 */
export function generateSecureRandom(length: number = 32): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";

  // Use crypto.getRandomValues for secure randomness
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);

  for (let i = 0; i < length; i++) {
    result += chars[array[i] % chars.length];
  }

  return result;
}

/**
 * Check if request is from a suspicious source
 */
export function isSuspiciousRequest(request: Request): boolean {
  const userAgent = request.headers.get("user-agent") || "";
  const referer = request.headers.get("referer") || "";

  // Check for common bot patterns
  const botPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python/i,
    /java/i,
    /go-http/i,
  ];

  if (botPatterns.some((pattern) => pattern.test(userAgent))) {
    return true;
  }

  // Check for suspicious referer patterns
  const suspiciousReferers = [/javascript:/i, /data:/i, /vbscript:/i];

  if (suspiciousReferers.some((pattern) => pattern.test(referer))) {
    return true;
  }

  return false;
}

/**
 * Rate limiting configuration for auth endpoints
 */
export const AUTH_RATE_LIMITS = {
  login: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
  refresh: {
    maxAttempts: 10,
    windowMs: 5 * 60 * 1000, // 5 minutes
  },
  magicLink: {
    maxAttempts: 3,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
} as const;

/**
 * Security headers for all responses
 */
export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
} as const;
