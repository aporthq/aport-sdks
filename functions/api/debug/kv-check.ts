/**
 * Debug endpoint to check KV store contents
 * This helps debug multi-tenant/multi-region issues
 */

import { cors } from "../../utils/cors";
import { PagesFunction } from "@cloudflare/workers-types";

export const onRequestGet: PagesFunction<any> = async ({ request, env }) => {
  const url = new URL(request.url);
  const ownerId = url.searchParams.get("owner_id");

  if (!ownerId) {
    return new Response(
      JSON.stringify({ error: "owner_id parameter required" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...cors(request) },
      }
    );
  }

  try {
    // Check default KV namespace
    const defaultIndexKey = `owner_agents:${ownerId}`;
    const defaultIndexData = await env.ai_passport_registry.get(
      defaultIndexKey,
      "json"
    );

    // Check if there are any passports for this owner
    const passportKeys = [];
    if (defaultIndexData && Array.isArray(defaultIndexData)) {
      for (const agentId of defaultIndexData) {
        const passportKey = `passport:${agentId}`;
        const passportData = await env.ai_passport_registry.get(
          passportKey,
          "json"
        );

        console.log(
          `Debug: Checking passport key "${passportKey}" for agent "${agentId}"`
        );
        console.log(`Debug: Passport data found:`, !!passportData);

        if (passportData) {
          passportKeys.push({
            agentId,
            passportKey,
            name: passportData.name,
            status: passportData.status,
            kind: passportData.kind,
            created_at: passportData.created_at,
          });
        } else {
          // Try alternative key formats
          const altKey1 = `agent:${agentId}`;
          const altKey2 = agentId; // Direct key
          const altKey3 = `passport_${agentId}`;

          console.log(`Debug: Trying alternative keys for agent "${agentId}"`);

          const altData1 = await env.ai_passport_registry.get(altKey1, "json");
          const altData2 = await env.ai_passport_registry.get(altKey2, "json");
          const altData3 = await env.ai_passport_registry.get(altKey3, "json");

          console.log(`Debug: altKey1 "${altKey1}":`, !!altData1);
          console.log(`Debug: altKey2 "${altKey2}":`, !!altData2);
          console.log(`Debug: altKey3 "${altKey3}":`, !!altData3);

          if (altData1 || altData2 || altData3) {
            const foundData = altData1 || altData2 || altData3;
            const foundKey = altData1 ? altKey1 : altData2 ? altKey2 : altKey3;
            passportKeys.push({
              agentId,
              passportKey: foundKey,
              name: foundData.name,
              status: foundData.status,
              kind: foundData.kind,
              created_at: foundData.created_at,
              note: "Found with alternative key format",
            });
          }
        }
      }
    }

    // Check if there are any KV_US bindings
    const kvUs = env.KV_US || env.KV_US_BINDING;
    let usIndexData = null;
    let usPassportKeys = [];

    if (kvUs) {
      const usIndexKey = `owner_agents:${ownerId}`;
      usIndexData = await kvUs.get(usIndexKey, "json");

      if (usIndexData && Array.isArray(usIndexData)) {
        for (const agentId of usIndexData) {
          const passportKey = `passport:${agentId}`;
          const passportData = await kvUs.get(passportKey, "json");

          console.log(
            `Debug US: Checking passport key "${passportKey}" for agent "${agentId}"`
          );
          console.log(`Debug US: Passport data found:`, !!passportData);

          if (passportData) {
            usPassportKeys.push({
              agentId,
              passportKey,
              name: passportData.name,
              status: passportData.status,
              kind: passportData.kind,
              created_at: passportData.created_at,
            });
          } else {
            // Try alternative key formats
            const altKey1 = `agent:${agentId}`;
            const altKey2 = agentId; // Direct key
            const altKey3 = `passport_${agentId}`;

            console.log(
              `Debug US: Trying alternative keys for agent "${agentId}"`
            );

            const altData1 = await kvUs.get(altKey1, "json");
            const altData2 = await kvUs.get(altKey2, "json");
            const altData3 = await kvUs.get(altKey3, "json");

            console.log(`Debug US: altKey1 "${altKey1}":`, !!altData1);
            console.log(`Debug US: altKey2 "${altKey2}":`, !!altData2);
            console.log(`Debug US: altKey3 "${altKey3}":`, !!altData3);

            if (altData1 || altData2 || altData3) {
              const foundData = altData1 || altData2 || altData3;
              const foundKey = altData1
                ? altKey1
                : altData2
                ? altKey2
                : altKey3;
              usPassportKeys.push({
                agentId,
                passportKey: foundKey,
                name: foundData.name,
                status: foundData.status,
                kind: foundData.kind,
                created_at: foundData.created_at,
                note: "Found with alternative key format",
              });
            }
          }
        }
      }
    }

    // Also try to list some passport keys to see what's actually stored
    const samplePassportKeys = [];
    try {
      // Try to get a few passport keys to see the pattern
      for (let i = 0; i < 10; i++) {
        const testKey = `passport:${i}`;
        const testData = await env.ai_passport_registry.get(testKey, "json");
        if (testData) {
          samplePassportKeys.push({
            key: testKey,
            hasData: true,
            name: testData.name,
            status: testData.status,
          });
        }
      }
    } catch (e) {
      console.log("Error sampling passport keys:", e);
    }

    return new Response(
      JSON.stringify({
        ownerId,
        defaultNamespace: {
          indexKey: defaultIndexKey,
          indexData: defaultIndexData,
          passportKeys,
        },
        usNamespace: {
          available: !!kvUs,
          indexKey: `owner_agents:${ownerId}`,
          indexData: usIndexData,
          passportKeys: usPassportKeys,
        },
        samplePassportKeys,
        availableEnvKeys: Object.keys(env).filter((k) => k.includes("KV")),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...cors(request) },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        ownerId,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...cors(request) },
      }
    );
  }
};
