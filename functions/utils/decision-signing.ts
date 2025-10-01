/**
 * Decision Signing Utilities
 *
 * Provides cryptographic signing of verification decisions for audit and verification purposes.
 */

import { Decision } from "../../shared/types/decision";

/**
 * Sign a decision with the registry private key
 */
export async function signDecision(
  decision: Decision,
  privateKey: string
): Promise<Decision> {
  try {
    // Create canonical representation of the decision
    const canonicalDecision = createCanonicalDecision(decision);

    // Sign the canonical decision
    const signature = await signWithEd25519(canonicalDecision, privateKey);

    // Return decision with signature
    return {
      ...decision,
      signature: `ed25519:${signature}`,
    };
  } catch (error) {
    console.error("Failed to sign decision", {
      error: error instanceof Error ? error.message : String(error),
      decision_id: decision.decision_id,
    });

    // Return original decision without signature
    return decision;
  }
}

/**
 * Verify a signed decision
 */
export async function verifyDecision(
  decision: Decision,
  publicKey: string
): Promise<boolean> {
  try {
    if (!decision.signature) {
      return false;
    }

    // Extract signature from format "ed25519:base64signature"
    const signatureMatch = decision.signature.match(/^ed25519:(.+)$/);
    if (!signatureMatch) {
      return false;
    }

    const signature = signatureMatch[1];

    // Create canonical representation
    const canonicalDecision = createCanonicalDecision(decision);

    // Verify signature
    return await verifyWithEd25519(canonicalDecision, signature, publicKey);
  } catch (error) {
    console.error("Failed to verify decision", {
      error: error instanceof Error ? error.message : String(error),
      decision_id: decision.decision_id,
    });

    return false;
  }
}

/**
 * Create canonical representation of decision for signing
 */
function createCanonicalDecision(decision: Decision): string {
  // Create a deterministic JSON representation
  const canonical = {
    decision_id: decision.decision_id,
    allow: decision.allow,
    reasons:
      decision.reasons?.sort((a, b) => a.code.localeCompare(b.code)) || [],
    expires_in: decision.expires_in,
    created_at: decision.created_at,
  };

  return JSON.stringify(canonical, Object.keys(canonical).sort());
}

/**
 * Sign data with Ed25519 using Web Crypto API
 */
async function signWithEd25519(
  data: string,
  privateKey: string
): Promise<string> {
  try {
    // Import private key
    const keyData = base64ToArrayBuffer(privateKey);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      {
        name: "Ed25519",
        namedCurve: "Ed25519",
      },
      false,
      ["sign"]
    );

    // Sign the data
    const dataBuffer = new TextEncoder().encode(data);
    const signature = await crypto.subtle.sign(
      "Ed25519",
      cryptoKey,
      dataBuffer
    );

    // Return base64-encoded signature
    return arrayBufferToBase64(signature);
  } catch (error) {
    console.error("Ed25519 signing failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Verify Ed25519 signature using Web Crypto API
 */
async function verifyWithEd25519(
  data: string,
  signature: string,
  publicKey: string
): Promise<boolean> {
  try {
    // Import public key
    const keyData = base64ToArrayBuffer(publicKey);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      {
        name: "Ed25519",
        namedCurve: "Ed25519",
      },
      false,
      ["verify"]
    );

    // Verify the signature
    const dataBuffer = new TextEncoder().encode(data);
    const signatureBuffer = base64ToArrayBuffer(signature);

    return await crypto.subtle.verify(
      "Ed25519",
      cryptoKey,
      signatureBuffer,
      dataBuffer
    );
  } catch (error) {
    console.error("Ed25519 verification failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Convert base64 string to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
