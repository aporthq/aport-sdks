import { KVNamespace } from "@cloudflare/workers-types";
import { User, Organization, OwnerInfo } from "../../types/owner";

/**
 * Validate and resolve owner information
 */
export async function validateAndResolveOwner(
  kv: KVNamespace,
  ownerId: string,
  ownerType: "org" | "user"
): Promise<{ valid: boolean; ownerInfo?: OwnerInfo; error?: string }> {
  try {
    // Validate owner ID format
    const expectedPrefix = ownerType === "org" ? "ap_org_" : "ap_user_";
    if (!ownerId.startsWith(expectedPrefix)) {
      return {
        valid: false,
        error: `Invalid ${ownerType} ID format. Must start with '${expectedPrefix}'`,
      };
    }

    // Check if owner exists
    const ownerData = await kv.get(`${ownerType}:${ownerId}`, "json");
    if (!ownerData) {
      return {
        valid: false,
        error: `${ownerType} not found`,
      };
    }

    // Extract owner information
    let ownerInfo: OwnerInfo;
    if (ownerType === "org") {
      const org = ownerData as Organization;
      ownerInfo = {
        owner_id: org.org_id,
        owner_type: "org",
        owner_display: org.name,
        assurance_level: org.assurance_level,
        assurance_method: org.assurance_method,
        assurance_verified_at: org.assurance_verified_at,
      };
    } else {
      const user = ownerData as User;
      ownerInfo = {
        owner_id: user.user_id,
        owner_type: "user",
        owner_display: user.display_name || "",
        assurance_level: user.assurance_level,
        assurance_method: user.assurance_method,
        assurance_verified_at: user.assurance_verified_at,
      };
    }

    return {
      valid: true,
      ownerInfo,
    };
  } catch (error) {
    console.error("Error validating owner:", error);
    return {
      valid: false,
      error: "Failed to validate owner",
    };
  }
}

/**
 * Update owner agents index
 */
export async function updateOwnerAgentsIndex(
  kv: KVNamespace,
  ownerId: string,
  agentId: string,
  action: "add" | "remove"
): Promise<void> {
  try {
    const indexKey = `owner_agents:${ownerId}`;
    console.log(
      `updateOwnerAgentsIndex: ${action} agent ${agentId} for owner ${ownerId}`
    );
    console.log(`updateOwnerAgentsIndex: indexKey = ${indexKey}`);
    console.log(`updateOwnerAgentsIndex: using KV namespace:`, kv);

    const indexData = await kv.get(indexKey, "json");
    const agentIds = (indexData as string[]) || [];
    console.log(
      `updateOwnerAgentsIndex: current agentIds = ${JSON.stringify(agentIds)}`
    );

    if (action === "add") {
      if (!agentIds.includes(agentId)) {
        agentIds.push(agentId);
        console.log(
          `updateOwnerAgentsIndex: adding agent ${agentId}, new list = ${JSON.stringify(
            agentIds
          )}`
        );
        await kv.put(indexKey, JSON.stringify(agentIds));
        console.log(
          `updateOwnerAgentsIndex: successfully updated index for owner ${ownerId}`
        );

        // Verify the index was written correctly
        const verifyData = await kv.get(indexKey, "json");
        const verifyIds = (verifyData as string[]) || [];
        console.log(
          `updateOwnerAgentsIndex: verification - index now contains ${
            verifyIds.length
          } agents: ${JSON.stringify(verifyIds)}`
        );
      } else {
        console.log(
          `updateOwnerAgentsIndex: agent ${agentId} already exists in index`
        );
      }
    } else if (action === "remove") {
      const updatedIds = agentIds.filter((id) => id !== agentId);
      console.log(
        `updateOwnerAgentsIndex: removing agent ${agentId}, new list = ${JSON.stringify(
          updatedIds
        )}`
      );
      if (updatedIds.length === 0) {
        await kv.delete(indexKey);
        console.log(
          `updateOwnerAgentsIndex: deleted empty index for owner ${ownerId}`
        );
      } else {
        await kv.put(indexKey, JSON.stringify(updatedIds));
        console.log(
          `updateOwnerAgentsIndex: updated index for owner ${ownerId}`
        );
      }
    }
  } catch (error) {
    console.error("Error updating owner agents index:", error);
    // Don't throw - this is not critical for passport creation
  }
}

/**
 * Update org agents index (for organizations)
 */
export async function updateOrgAgentsIndex(
  kv: KVNamespace,
  orgId: string,
  agentId: string,
  action: "add" | "remove"
): Promise<void> {
  try {
    const indexKey = `org_agents:${orgId}`;
    const indexData = await kv.get(indexKey, "json");
    const agentIds = (indexData as string[]) || [];

    if (action === "add") {
      if (!agentIds.includes(agentId)) {
        agentIds.push(agentId);
        await kv.put(indexKey, JSON.stringify(agentIds));
      }
    } else if (action === "remove") {
      const updatedIds = agentIds.filter((id) => id !== agentId);
      if (updatedIds.length === 0) {
        await kv.delete(indexKey);
      } else {
        await kv.put(indexKey, JSON.stringify(updatedIds));
      }
    }
  } catch (error) {
    console.error("Error updating org agents index:", error);
    // Don't throw - this is not critical for passport creation
  }
}
