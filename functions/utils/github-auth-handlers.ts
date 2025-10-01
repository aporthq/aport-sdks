/**
 * GitHub Authentication Flow Handlers
 *
 * Provides separate handlers for regular GitHub auth and org verification flows
 * to be used in the consolidated callback endpoint.
 */

import { AuthEnv } from "../../types/auth";
import { GitHubOrgMembership } from "../../types/owner";
import {
  exchangeCodeForToken,
  getGitHubUserData,
  getGitHubUserEmails,
  getGitHubConfig,
  createUserIdFromGitHub,
  generateDisplayName,
  hasVerifiedEmail,
  getGitHubUserOrgs,
  verifyGitHubOrgMembership,
} from "./github";
import {
  createOrUpdateUser,
  createSession,
  createJWT,
  createAuthCookies,
  getClientIP,
  getUserAgent,
} from "./auth";
import {
  AttestationService,
  getAttestationConfig,
  createEvidenceForType,
} from "./attestation-service";
import { getAppBaseUrl } from "./email";

export interface GitHubAuthResult {
  user: any;
  githubUser: any;
  email: string;
  sessionId: string;
  refreshTokenId: string;
  jwt: string;
  cookies: { accessToken: string; refreshToken: string };
  verifiedOrgs?: GitHubOrgMembership[];
}

export interface GitHubAuthState {
  return_url: string;
  turnstile_verified: boolean;
  org_login?: string;
  purpose?: string;
  created_at: string;
}

/**
 * Handle regular GitHub authentication flow
 */
export async function handleRegularGitHubAuth(
  env: AuthEnv,
  accessToken: string,
  stateData: GitHubAuthState,
  request: Request
): Promise<GitHubAuthResult> {
  // Get GitHub user data
  const githubUser = await getGitHubUserData(accessToken);
  if (!githubUser) {
    throw new Error("Failed to fetch GitHub user data");
  }

  // Get user's email if not public
  let email = githubUser.email;
  if (!email || !email?.includes("@")) {
    const emails = await getGitHubUserEmails(accessToken);
    email = emails.find((e) => e.includes("@")) || emails[0];
    githubUser.email = email;
  }

  // Create deterministic user ID from email (same as email verification)
  const emailHash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(email)
  );
  const emailHashHex = Array.from(new Uint8Array(emailHash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .substring(0, 16);
  const userId = `ap_user_${emailHashHex}`;

  // Create or update user first (without assurance level)
  const user = await createOrUpdateUser(env.ai_passport_registry, {
    user_id: userId,
    email: email,
    github_id: githubUser.id.toString(),
    github_login: githubUser.login,
    display_name: generateDisplayName(githubUser),
    last_login_at: new Date().toISOString(),
  });

  // Update assurance level using attestation service
  try {
    const attestationConfig = getAttestationConfig(env);
    const evidence = createEvidenceForType(
      "github_verification",
      githubUser.login,
      {
        github_id: githubUser.id.toString(),
        github_login: githubUser.login,
        email: email,
        has_verified_email: hasVerifiedEmail(githubUser, { email: email }),
      }
    );

    const attestationService = new AttestationService(
      env.ai_passport_registry,
      attestationConfig,
      env.AP_VERSION
    );

    // Create and verify attestation
    const attestation = await attestationService.createAttestation({
      type: "github_verification",
      subject_id: userId,
      subject_type: "user",
      evidence,
      verified_by: "github_oauth",
      comment: `GitHub OAuth verification for ${githubUser.login}`,
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
    });

    const verificationResult = await attestationService.verifyEvidence({
      attestation_id: attestation.attestation_id,
      evidence: {
        ...evidence,
        verified_at: new Date().toISOString(),
      },
      verified_by: "github_oauth",
      comment: `GitHub OAuth verification for ${githubUser.login}`,
    });

    if (verificationResult.valid && verificationResult.attestation) {
      // Update user's assurance level directly
      const updatedUser = await createOrUpdateUser(env.ai_passport_registry, {
        user_id: userId,
        assurance_level: verificationResult.attestation.assurance_level,
        assurance_method: verificationResult.attestation.assurance_method,
        assurance_verified_at:
          verificationResult.attestation.evidence.verified_at,
      });

      console.log(
        `[GitHub Auth] Updated user ${userId} assurance level to ${verificationResult.attestation.assurance_level}`
      );

      // Update the user object for the return value
      user.assurance_level = updatedUser.assurance_level;
      user.assurance_method = updatedUser.assurance_method;
      user.assurance_verified_at = updatedUser.assurance_verified_at;
    } else {
      console.warn(
        `[GitHub Auth] Failed to verify attestation: ${verificationResult.error}`
      );
    }
  } catch (error) {
    console.error("Error updating assurance level:", error);
    // Fallback to basic assurance level
    const fallbackLevel = hasVerifiedEmail(githubUser) ? "L2" : "L1";
    await createOrUpdateUser(env.ai_passport_registry, {
      user_id: userId,
      assurance_level: fallbackLevel,
      assurance_method: "github_verified",
      assurance_verified_at: new Date().toISOString(),
    });
  }

  // Create session
  const { sessionId, refreshTokenId } = await createSession(
    env.ai_passport_registry,
    user,
    "github",
    getClientIP(request),
    getUserAgent(request),
    stateData.turnstile_verified
  );

  // Create JWT
  const jwt = await createJWT(
    {
      sub: user.user_id,
      session_id: sessionId,
      provider: "github",
      assurance_level: user.assurance_level,
      turnstile_verified: stateData.turnstile_verified,
    },
    env.JWT_SECRET,
    900 // 15 minutes
  );

  // Create cookies (detect local development)
  const isLocalDev = env.APP_BASE_URL && env.APP_BASE_URL.includes("localhost");
  const cookies = createAuthCookies(
    jwt,
    refreshTokenId,
    isLocalDev ? ".localhost" : undefined, // Use .localhost for cross-port access
    !!isLocalDev
  );

  return {
    user,
    githubUser,
    email,
    sessionId,
    refreshTokenId,
    jwt,
    cookies,
  };
}

/**
 * Handle GitHub organization verification flow
 */
export async function handleGitHubOrgVerification(
  env: AuthEnv,
  accessToken: string,
  stateData: GitHubAuthState,
  request: Request
): Promise<GitHubAuthResult> {
  // Get GitHub user data
  const githubUser = await getGitHubUserData(accessToken);
  if (!githubUser) {
    throw new Error("Failed to fetch GitHub user data");
  }

  // Get user's email if not public
  let email = githubUser.email;
  if (!email) {
    const emails = await getGitHubUserEmails(accessToken);
    email = emails.find((e) => e.includes("@")) || emails[0];
    githubUser.email = email;
  }

  // Create deterministic user ID from email (same as email verification)
  const emailHash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(email)
  );
  const emailHashHex = Array.from(new Uint8Array(emailHash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .substring(0, 16);
  const userId = `ap_user_${emailHashHex}`;

  // Get user's organization memberships
  const orgMemberships = await getGitHubUserOrgs(accessToken);
  console.log(
    `[GitHub Org Callback] Found ${orgMemberships.length} org memberships for user ${githubUser.login}`
  );

  const verifiedOrgs: GitHubOrgMembership[] = [];

  // If specific org was requested, verify only that org
  if (stateData.org_login) {
    console.log(
      `[GitHub Org Callback] Verifying specific org: ${stateData.org_login}`
    );
    const verification = await verifyGitHubOrgMembership(
      accessToken,
      stateData.org_login,
      githubUser.login
    );

    if (verification.isMember && verification.org) {
      console.log(
        `[GitHub Org Callback] User ${githubUser.login} is ${verification.role} of ${verification.org.login}`
      );
      verifiedOrgs.push({
        org_id: verification.org.id,
        org_login: verification.org.login,
        org_name: verification.org.name,
        role: verification.role!,
        verified_at: new Date().toISOString(),
        metadata: {
          org_avatar_url: verification.org.avatar_url,
          org_html_url: verification.org.html_url,
          org_description: verification.org.description,
        },
      });
    } else {
      console.log(
        `[GitHub Org Callback] User ${githubUser.login} is NOT a member of ${stateData.org_login}`
      );
    }
  } else {
    // Process all organizations
    console.log(
      `[GitHub Org Callback] Processing all ${orgMemberships.length} org memberships`
    );
    for (const membership of orgMemberships) {
      console.log(
        `[GitHub Org Callback] User ${githubUser.login} is ${membership.role} of ${membership.organization.login}`
      );
      verifiedOrgs.push({
        org_id: membership.organization.id,
        org_login: membership.organization.login,
        org_name: membership.organization.name,
        role: membership.role,
        verified_at: new Date().toISOString(),
        metadata: {
          org_avatar_url: membership.organization.avatar_url,
          org_html_url: membership.organization.html_url,
          org_description: membership.organization.description,
        },
      });
    }
  }

  console.log(
    `[GitHub Org Callback] Saving ${verifiedOrgs.length} org memberships to user profile`
  );

  // Create or update user with org memberships first
  const user = await createOrUpdateUser(env.ai_passport_registry, {
    user_id: userId,
    email: email,
    github_id: githubUser.id.toString(),
    github_login: githubUser.login,
    display_name: generateDisplayName(githubUser),
    last_login_at: new Date().toISOString(),
    github_org_memberships: verifiedOrgs,
  });

  // Update assurance level using attestation service
  try {
    const attestationConfig = getAttestationConfig(env);
    const attestationService = new AttestationService(
      env.ai_passport_registry,
      attestationConfig,
      env.AP_VERSION
    );

    let highestAssuranceLevel = "L0";
    let latestAttestation = null;

    // Create attestations for each organization membership
    for (const org of verifiedOrgs) {
      const evidence = createEvidenceForType(
        "github_org_verification",
        `${githubUser.login}:${org.org_login}`,
        {
          github_user_id: githubUser.id.toString(),
          github_user_login: githubUser.login,
          org_id: org.org_id,
          org_login: org.org_login,
          role: org.role,
          email: email,
          has_verified_email: hasVerifiedEmail(githubUser),
        }
      );

      // Create and verify attestation for this org
      const attestation = await attestationService.createAttestation({
        type: "github_org_verification",
        subject_id: userId,
        subject_type: "user",
        evidence,
        verified_by: "github_org_oauth",
        comment: `GitHub organization verification for ${githubUser.login} in ${org.org_login}`,
        expires_at: new Date(
          Date.now() + 90 * 24 * 60 * 60 * 1000
        ).toISOString(), // 90 days
      });

      const verificationResult = await attestationService.verifyEvidence({
        attestation_id: attestation.attestation_id,
        evidence: {
          ...evidence,
          verified_at: new Date().toISOString(),
        },
        verified_by: "github_org_oauth",
        comment: `GitHub organization verification for ${githubUser.login} in ${org.org_login}`,
      });

      if (verificationResult.valid && verificationResult.attestation) {
        console.log(
          `[GitHub Org Callback] Verified org membership: ${org.org_login} for user ${userId}`
        );

        // Track the highest assurance level
        const assuranceLevels = ["L0", "L1", "L2", "L3", "L4KYC", "L4FIN"];
        const currentLevel = assuranceLevels.indexOf(highestAssuranceLevel);
        const newLevel = assuranceLevels.indexOf(
          verificationResult.attestation.assurance_level
        );

        if (newLevel > currentLevel) {
          highestAssuranceLevel =
            verificationResult.attestation.assurance_level;
          latestAttestation = verificationResult.attestation;
        }
      } else {
        console.warn(
          `[GitHub Org Callback] Failed to verify attestation for ${org.org_login}: ${verificationResult.error}`
        );
      }
    }

    // Update user's assurance level with the highest level achieved
    if (latestAttestation) {
      const updatedUser = await createOrUpdateUser(env.ai_passport_registry, {
        user_id: userId,
        assurance_level: latestAttestation.assurance_level,
        assurance_method: latestAttestation.assurance_method,
        assurance_verified_at: latestAttestation.evidence.verified_at,
      });

      console.log(
        `[GitHub Org Callback] Updated user ${userId} assurance level to ${latestAttestation.assurance_level}`
      );

      // Update the user object for the return value
      user.assurance_level = updatedUser.assurance_level;
      user.assurance_method = updatedUser.assurance_method;
      user.assurance_verified_at = updatedUser.assurance_verified_at;
    } else {
      console.warn(
        `[GitHub Org Callback] No valid attestations created for user ${userId}`
      );
    }
  } catch (error) {
    console.error("Error updating assurance level:", error);
    // Fallback to basic assurance level
    const fallbackLevel = hasVerifiedEmail(githubUser) ? "L2" : "L1";
    await createOrUpdateUser(env.ai_passport_registry, {
      user_id: userId,
      assurance_level: fallbackLevel,
      assurance_method: "github_verified",
      assurance_verified_at: new Date().toISOString(),
    });
  }

  // Create session
  const { sessionId, refreshTokenId } = await createSession(
    env.ai_passport_registry,
    user,
    "github",
    getClientIP(request),
    getUserAgent(request),
    stateData.turnstile_verified
  );

  // Create JWT
  const jwt = await createJWT(
    {
      sub: user.user_id,
      session_id: sessionId,
      provider: "github",
      assurance_level: user.assurance_level,
      turnstile_verified: stateData.turnstile_verified,
    },
    env.JWT_SECRET,
    900 // 15 minutes
  );

  // Create cookies (detect local development)
  const isLocalDev = env.APP_BASE_URL && env.APP_BASE_URL.includes("localhost");
  const cookies = createAuthCookies(
    jwt,
    refreshTokenId,
    isLocalDev ? ".localhost" : undefined,
    !!isLocalDev
  );

  return {
    user,
    githubUser,
    email,
    sessionId,
    refreshTokenId,
    jwt,
    cookies,
    verifiedOrgs,
  };
}

/**
 * Generate success page HTML for regular GitHub auth
 */
export function generateRegularAuthSuccessPage(
  result: GitHubAuthResult,
  env: AuthEnv,
  returnUrl?: string
): string {
  const { user, githubUser, email, jwt, refreshTokenId } = result;
  const isLocalDev = env.APP_BASE_URL && env.APP_BASE_URL.includes("localhost");

  // Use returnUrl if provided, otherwise default to user dashboard
  const redirectUrl = returnUrl
    ? returnUrl.startsWith("http")
      ? returnUrl
      : `${getAppBaseUrl(env)}/${returnUrl.replace(/^\//, "")}`
    : `${getAppBaseUrl(env)}/user-dashboard`;
  const finalUrl = isLocalDev
    ? `${redirectUrl}${
        redirectUrl.includes("?") ? "&" : "?"
      }auth_token=${jwt}&refresh_token=${refreshTokenId}`
    : redirectUrl;

  return `
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign In Successful - Agent Passport</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      tailwind.config = {
        darkMode: 'class',
        theme: {
          extend: {
            colors: {
              passport: {
                primary: '#06b6d4',
                'primary-light': '#67e8f9',
                'primary-dark': '#0891b2',
                background: '#0f172a',
                'background-dark': '#0f172a',
                card: '#1e293b',
                'card-dark': '#1e293b',
                border: '#334155',
                text: '#f1f5f9',
                'text-light': '#f8fafc',
                'text-muted': '#94a3b8',
              }
            }
          }
        }
      }
    </script>
</head>
<body class="min-h-screen bg-gradient-to-br from-passport-background via-passport-background to-slate-900 flex items-center justify-center">
    <div class="max-w-md w-full bg-passport-card rounded-lg shadow-passport-lg p-8 text-center border border-passport-border">
        <div class="mb-6">
            <div class="w-16 h-16 bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-500/20">
                <svg class="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
            </div>
            <h1 class="text-2xl font-bold text-passport-text mb-2">Sign In Successful!</h1>
            <p class="text-passport-text-muted">You have been successfully signed in to Agent Passport.</p>
        </div>
        
        <div class="bg-slate-800/50 rounded-lg p-4 mb-6 border border-passport-border">
            <div class="text-sm text-passport-text-muted mb-1">GitHub Account</div>
            <div class="font-mono text-lg font-semibold text-passport-text">${
              githubUser.login
            }</div>
            ${
              email
                ? `<div class="text-sm text-passport-text-muted mt-1">${email}</div>`
                : ""
            }
        </div>
        
        <div class="space-y-3">
            <div class="flex items-center justify-center space-x-2 text-sm text-passport-text-muted">
                <svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span>GitHub verified: ${githubUser.login}</span>
            </div>
            <div class="flex items-center justify-center space-x-2 text-sm text-passport-text-muted">
                <svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span>Assurance Level: ${
                  user.assurance_level
                } (GitHub Verified)</span>
            </div>
        </div>
        
        <div class="mt-8">
            <a href="${finalUrl}" class="inline-flex items-center px-4 py-2 bg-passport-primary text-white rounded-md hover:bg-passport-primary-dark transition-colors shadow-passport">
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                </svg>
                Go to Dashboard
            </a>
        </div>
        
        <div class="mt-6 text-xs text-passport-text-muted">
            This page will automatically redirect in <span id="countdown">1</span> second
        </div>
    </div>
    
    <script>
        let countdown = 1;
        const countdownElement = document.getElementById('countdown');
        
        const timer = setInterval(() => {
            countdown--;
            countdownElement.textContent = countdown;
            
            if (countdown <= 0) {
                clearInterval(timer);
                window.location.href = '${finalUrl}';
            }
        }, 1000);
    </script>
</body>
</html>`;
}

/**
 * Generate success page HTML for GitHub org verification
 */
export function generateOrgVerificationSuccessPage(
  result: GitHubAuthResult,
  env: AuthEnv,
  returnUrl?: string
): string {
  const {
    user,
    githubUser,
    email,
    jwt,
    refreshTokenId,
    verifiedOrgs = [],
  } = result;
  const isLocalDev = env.APP_BASE_URL && env.APP_BASE_URL.includes("localhost");

  // Use returnUrl if provided, otherwise default to user dashboard
  const redirectUrl = returnUrl
    ? returnUrl.startsWith("http")
      ? returnUrl
      : `${getAppBaseUrl(env)}/${returnUrl.replace(/^\//, "")}`
    : `${getAppBaseUrl(env)}/user-dashboard`;
  const finalUrl = isLocalDev
    ? `${redirectUrl}${
        redirectUrl.includes("?") ? "&" : "?"
      }auth_token=${jwt}&refresh_token=${refreshTokenId}`
    : redirectUrl;

  return `
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GitHub Organization Verification - Agent Passport</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      tailwind.config = {
        darkMode: 'class',
        theme: {
          extend: {
            colors: {
              passport: {
                primary: '#06b6d4',
                'primary-light': '#67e8f9',
                'primary-dark': '#0891b2',
                background: '#0f172a',
                'background-dark': '#0f172a',
                card: '#1e293b',
                'card-dark': '#1e293b',
                border: '#334155',
                text: '#f1f5f9',
                'text-light': '#f8fafc',
                'text-muted': '#94a3b8',
              }
            }
          }
        }
      }
    </script>
</head>
<body class="min-h-screen bg-gradient-to-br from-passport-background via-passport-background to-slate-900 flex items-center justify-center">
    <div class="max-w-2xl w-full bg-passport-card rounded-lg shadow-passport-lg p-8 border border-passport-border">
        <div class="mb-6">
            <div class="w-16 h-16 bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-500/20">
                <svg class="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
            </div>
            <h1 class="text-2xl font-bold text-passport-text mb-2 text-center">Organization Verification Complete!</h1>
            <p class="text-passport-text-muted text-center">Your GitHub organization memberships have been verified and attestations created.</p>
        </div>
        
        <div class="bg-slate-800/50 rounded-lg p-4 mb-6 border border-passport-border">
            <div class="text-sm text-passport-text-muted mb-1">GitHub Account</div>
            <div class="font-mono text-lg font-semibold text-passport-text">${
              githubUser.login
            }</div>
            ${
              email
                ? `<div class="text-sm text-passport-text-muted mt-1">${email}</div>`
                : ""
            }
        </div>
        
        <div class="mb-6">
            <h2 class="text-lg font-semibold text-passport-text mb-3">Organization Memberships</h2>
            <div class="space-y-2">
                ${verifiedOrgs
                  .map(
                    (org) => `
                    <div class="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-passport-border">
                        <div class="flex items-center space-x-3">
                            <div class="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center">
                                <svg class="w-4 h-4 text-passport-text-muted" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"></path>
                                </svg>
                            </div>
                            <div>
                                <div class="font-medium text-passport-text">${org.org_login}</div>
                                <div class="text-sm text-passport-text-muted">${org.org_name} (${org.role})</div>
                            </div>
                        </div>
                        <div class="flex items-center space-x-2">
                            <svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                            </svg>
                            <span class="text-sm text-green-400 font-medium">Saved</span>
                        </div>
                    </div>
                `
                  )
                  .join("")}
            </div>
            ${
              verifiedOrgs.length === 0
                ? `
                <div class="text-center py-4 text-passport-text-muted">
                    No organization memberships found
                </div>
            `
                : ""
            }
        </div>
        
        <div class="space-y-3 mb-6">
            <div class="flex items-center justify-center space-x-2 text-sm text-passport-text-muted">
                <svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span>GitHub verified: ${githubUser.login}</span>
            </div>
            <div class="flex items-center justify-center space-x-2 text-sm text-passport-text-muted">
                <svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span>Assurance Level: ${
                  user.assurance_level
                } (GitHub Org Verified)</span>
            </div>
        </div>
        
        <div class="text-center">
            <a href="${finalUrl}" class="inline-flex items-center px-4 py-2 bg-passport-primary text-white rounded-md hover:bg-passport-primary-dark transition-colors shadow-passport">
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                </svg>
                Go to Dashboard
            </a>
        </div>
        
        <div class="mt-6 text-xs text-passport-text-muted text-center">
            This page will automatically redirect in <span id="countdown">1</span> second
        </div>
    </div>
    
    <script>
        let countdown = 1;
        const countdownElement = document.getElementById('countdown');
        
        const timer = setInterval(() => {
            countdown--;
            countdownElement.textContent = countdown;
            
            if (countdown <= 0) {
                clearInterval(timer);
                window.location.href = '${finalUrl}';
            }
        }, 1000);
    </script>
</body>
</html>`;
}
