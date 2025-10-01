/**
 * GitHub OAuth Service
 *
 * Handles GitHub OAuth authentication and user data retrieval.
 */

import { GitHubUserData, TurnstileVerificationResult } from "../../types/auth";
import { AuthEnv } from "../../types/auth";

/**
 * GitHub OAuth configuration
 */
export interface GitHubConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * GitHub OAuth token response
 */
interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

/**
 * Exchange GitHub OAuth code for access token
 */
export async function exchangeCodeForToken(
  code: string,
  config: GitHubConfig
): Promise<string | null> {
  try {
    const response = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code: code,
          redirect_uri: config.redirectUri,
        }),
      }
    );

    if (!response.ok) {
      console.error(
        "GitHub token exchange failed:",
        response.status,
        response.statusText
      );
      return null;
    }

    const data = (await response.json()) as GitHubTokenResponse;
    return data.access_token;
  } catch (error) {
    console.error("GitHub token exchange error:", error);
    return null;
  }
}

/**
 * Check if GitHub access token is valid and not expired
 */
export async function isGitHubTokenValid(
  accessToken: string
): Promise<boolean> {
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Agent-Passport/1.0",
      },
    });

    return response.ok;
  } catch (error) {
    console.error("GitHub token validation error:", error);
    return false;
  }
}

/**
 * Get GitHub user data using access token
 */
export async function getGitHubUserData(
  accessToken: string
): Promise<GitHubUserData | null> {
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Agent-Passport/1.0",
      },
    });

    if (!response.ok) {
      console.error(
        "GitHub user data fetch failed:",
        response.status,
        response.statusText
      );
      return null;
    }

    const data = (await response.json()) as GitHubUserData;
    return {
      id: data.id,
      login: data.login,
      name: data.name,
      email: data.email,
      avatar_url: data.avatar_url,
    };
  } catch (error) {
    console.error("GitHub user data fetch error:", error);
    return null;
  }
}

/**
 * Get GitHub user's primary email if not public
 */
export async function getGitHubUserEmails(
  accessToken: string
): Promise<string[]> {
  try {
    const response = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Agent-Passport/1.0",
      },
    });

    if (!response.ok) {
      console.error(
        "GitHub user emails fetch failed:",
        response.status,
        response.statusText
      );
      return [];
    }

    const emails = (await response.json()) as Array<{
      email: string;
      primary: boolean;
      verified: boolean;
    }>;

    return emails.filter((email) => email.verified).map((email) => email.email);
  } catch (error) {
    console.error("GitHub user emails fetch error:", error);
    return [];
  }
}

/**
 * Verify Turnstile token with Cloudflare
 */
export async function verifyTurnstileToken(
  token: string,
  secretKey: string,
  remoteIP?: string
): Promise<TurnstileVerificationResult> {
  try {
    const formData = new FormData();
    formData.append("secret", secretKey);
    formData.append("response", token);
    if (remoteIP) {
      formData.append("remoteip", remoteIP);
    }

    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      return {
        success: false,
        error_codes: ["network_error"],
      };
    }

    const result = (await response.json()) as {
      success: boolean;
      error_codes?: string[];
      challenge_ts?: string;
      hostname?: string;
    };

    return {
      success: result.success,
      error_codes: result.error_codes,
      challenge_ts: result.challenge_ts,
      hostname: result.hostname,
    };
  } catch (error) {
    console.error("Turnstile verification error:", error);
    return {
      success: false,
      error_codes: ["verification_failed"],
    };
  }
}

/**
 * Create GitHub OAuth authorization URL
 */
export function createGitHubAuthURL(
  config: GitHubConfig,
  state: string,
  forceConsent: boolean = false
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state: state,
    scope: "user:email read:org", // Request email and org access
  });

  // Only add prompt=consent if explicitly requested (for re-authorization)
  if (forceConsent) {
    params.set("prompt", "consent");
  }

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/**
 * Create GitHub OAuth authorization URL for org membership verification
 */
export function createGitHubOrgAuthURL(
  config: GitHubConfig,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state: state,
    scope: "user:email read:org", // Request email and org access
    prompt: "consent",
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/**
 * Validate GitHub OAuth callback
 */
export function validateGitHubCallback(
  code: string,
  state: string,
  expectedState: string
): { valid: boolean; error?: string } {
  if (!code) {
    return { valid: false, error: "Missing authorization code" };
  }

  if (!state || state !== expectedState) {
    return { valid: false, error: "Invalid or missing state parameter" };
  }

  return { valid: true };
}

/**
 * Get GitHub configuration from environment
 */
export function getGitHubConfig(env: AuthEnv): GitHubConfig {
  return {
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    redirectUri: env.GITHUB_REDIRECT_URI,
  };
}

/**
 * Check if GitHub user has verified email
 */
export function hasVerifiedEmail(userData: GitHubUserData, {email = ""}: {email?: string} = {}): boolean {
  return !!(userData.email && userData.email.includes("@")) || !!(email && email.includes("@"));
}

/**
 * Generate user display name from GitHub data
 */
export function generateDisplayName(userData: GitHubUserData): string {
  return userData.name || userData.login || "GitHub User";
}

/**
 * Create user ID from GitHub ID
 */
export function createUserIdFromGitHub(githubId: number): string {
  return `ap_user_${githubId}`;
}

/**
 * Check if user ID is a GitHub-based user ID
 */
export function isGitHubUserId(userId: string): boolean {
  return (
    userId.startsWith("ap_user_") &&
    /^\d+$/.test(userId.replace("ap_user_", ""))
  );
}

/**
 * GitHub organization data
 */
export interface GitHubOrg {
  id: number;
  login: string;
  name: string;
  description?: string;
  avatar_url: string;
  url: string;
  html_url: string;
}

/**
 * GitHub organization membership data
 */
export interface GitHubOrgMembership {
  organization: GitHubOrg;
  role: "member" | "admin";
  state: "active" | "pending";
  user: {
    id: number;
    login: string;
  };
}

/**
 * Get user's GitHub organization memberships
 */
export async function getGitHubUserOrgs(
  accessToken: string
): Promise<GitHubOrgMembership[]> {
  try {
    console.log("[GitHub API] Fetching user organizations...");
    const response = await fetch(
      "https://api.github.com/user/memberships/orgs",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Agent-Passport/1.0",
        },
      }
    );

    console.log(`[GitHub API] Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "GitHub user orgs fetch failed:",
        response.status,
        response.statusText,
        errorText
      );
      return [];
    }

    const memberships = (await response.json()) as GitHubOrgMembership[];
    console.log(
      `[GitHub API] Raw memberships:`,
      JSON.stringify(memberships, null, 2)
    );

    const activeMemberships = memberships.filter(
      (membership) => membership.state === "active"
    );
    console.log(`[GitHub API] Active memberships: ${activeMemberships.length}`);

    return activeMemberships;
  } catch (error) {
    console.error("GitHub user orgs fetch error:", error);
    return [];
  }
}

/**
 * Get specific GitHub organization details
 */
export async function getGitHubOrg(
  accessToken: string,
  orgLogin: string
): Promise<GitHubOrg | null> {
  try {
    const response = await fetch(`https://api.github.com/orgs/${orgLogin}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Agent-Passport/1.0",
      },
    });

    if (!response.ok) {
      console.error(
        "GitHub org fetch failed:",
        response.status,
        response.statusText
      );
      return null;
    }

    const org = (await response.json()) as GitHubOrg;
    return org;
  } catch (error) {
    console.error("GitHub org fetch error:", error);
    return null;
  }
}

/**
 * Verify user's membership in a specific GitHub organization
 */
export async function verifyGitHubOrgMembership(
  accessToken: string,
  orgLogin: string,
  userLogin: string
): Promise<{
  isMember: boolean;
  role?: "member" | "admin";
  org?: GitHubOrg;
}> {
  try {
    // First, get the user's org memberships
    const memberships = await getGitHubUserOrgs(accessToken);
    const membership = memberships.find(
      (m) => m.organization.login === orgLogin
    );

    if (!membership) {
      return { isMember: false };
    }

    // Get the full org details
    const org = await getGitHubOrg(accessToken, orgLogin);

    return {
      isMember: true,
      role: membership.role,
      org: org || undefined,
    };
  } catch (error) {
    console.error("GitHub org membership verification error:", error);
    return { isMember: false };
  }
}
