/**
 * Cache purging utilities for Cloudflare edge cache
 * B3: Consistency on suspend - purge CF edge cache for verify URLs
 */

interface CloudflarePurgeResponse {
  success: boolean;
  errors: Array<{
    code: number;
    message: string;
  }>;
  messages: Array<{
    code: number;
    message: string;
  }>;
  result: {
    id: string;
  };
}

/**
 * Purge Cloudflare edge cache for a specific verify URL
 * This ensures status changes are visible in seconds
 */
export async function purgeVerifyCache(
  agentId: string,
  baseUrl: string = "https://aport.io",
  cfApiToken?: string,
  cfZoneId?: string
): Promise<void> {
  const verifyUrl = `${baseUrl}/api/verify/${encodeURIComponent(agentId)}`;

  try {
    // Check if API credentials are available
    if (!cfApiToken || !cfZoneId) {
      console.warn(
        `Cloudflare API credentials not configured, skipping cache purge for: ${verifyUrl}`
      );
      console.log(
        `To enable cache purging, set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID as Pages secrets`
      );
      return;
    }

    console.log(`Purging Cloudflare cache for: ${verifyUrl}`);

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${cfZoneId}/purge_cache`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfApiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          files: [verifyUrl],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Cloudflare API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const result: CloudflarePurgeResponse = await response.json();

    if (result.success) {
      console.log(`Successfully purged cache for: ${verifyUrl}`);
    } else {
      console.error(`Cache purge failed for ${verifyUrl}:`, result.errors);
    }
  } catch (error) {
    console.error(`Failed to purge cache for ${verifyUrl}:`, error);
    // Don't throw - cache purging is best effort
  }
}

/**
 * Purge multiple verify URLs atomically
 */
export async function purgeMultipleVerifyCaches(
  agentIds: string[],
  baseUrl: string = "https://aport.io",
  cfApiToken?: string,
  cfZoneId?: string
): Promise<void> {
  const verifyUrls = agentIds.map(
    (agentId) => `${baseUrl}/api/verify/${encodeURIComponent(agentId)}`
  );

  try {
    // Check if API credentials are available
    if (!cfApiToken || !cfZoneId) {
      console.warn(
        `Cloudflare API credentials not configured, skipping batch cache purge for ${agentIds.length} URLs`
      );
      console.log(
        `To enable cache purging, set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID as Pages secrets`
      );
      return;
    }

    console.log(
      `Purging Cloudflare cache for ${agentIds.length} URLs:`,
      verifyUrls
    );

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${cfZoneId}/purge_cache`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfApiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          files: verifyUrls,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Cloudflare API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const result: CloudflarePurgeResponse = await response.json();

    if (result.success) {
      console.log(`Successfully purged cache for ${agentIds.length} URLs`);
    } else {
      console.error(
        `Batch cache purge failed for ${agentIds.length} URLs:`,
        result.errors
      );
    }
  } catch (error) {
    console.error(`Failed to purge cache for ${agentIds.length} URLs:`, error);
    // Don't throw - cache purging is best effort
  }
}
