// Cloudflare Pages Function for dynamic agent routes
export async function onRequest(context: any) {
  const { request, params } = context;
  const agentId = params.id;

  try {
    // Get the base URL for the static site
    const baseUrl = new URL(request.url);
    baseUrl.pathname = "/agents";
    baseUrl.search = `?id=${agentId}`;

    // Fetch the Next.js static page with the agent ID as a query parameter
    const staticPageResponse = await fetch(baseUrl.toString());

    if (!staticPageResponse.ok) {
      return new Response("Page not found", { status: 404 });
    }

    const html = await staticPageResponse.text();

    // Inject the agent ID and metadata into the page
    const updatedHtml = html.replace(
      "</head>",
      `
        <script>
          // Inject agent ID for client-side use
          window.__AGENT_ID__ = '${agentId}';
        </script>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "name": "Agent ${agentId}",
            "description": "AI Agent Passport for agent ${agentId}",
            "applicationCategory": "AI Agent",
            "status": "active"
          }
        </script>
      </head>`
    );

    return new Response(updatedHtml, {
      headers: {
        "Content-Type": "text/html",
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("Error in agents/[id] function:", error);
    // Fallback to static page
    const baseUrl = new URL("/agents", request.url);
    const staticPage = await fetch(baseUrl.toString());
    return new Response(await staticPage.text(), {
      headers: { "Content-Type": "text/html" },
    });
  }
}
