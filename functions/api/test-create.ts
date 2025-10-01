import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestPost: PagesFunction<any> = async ({ request, env }) => {
  console.log("Test POST endpoint called");

  return new Response(
    JSON.stringify({
      success: true,
      message: "Test endpoint working",
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
};
