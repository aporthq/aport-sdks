// Cloudflare Pages Function for dynamic mint routes
export async function onRequest(context: any) {
  const { request, params } = context;
  const templateId = params.template_id;

  try {
    // Get the base URL for the static site
    const baseUrl = new URL(request.url);
    baseUrl.pathname = "/agents/mint";
    baseUrl.search = `?template_id=${templateId}`;

    // Fetch the Next.js static page with the template ID as a query parameter
    const staticPageResponse = await fetch(baseUrl.toString());

    if (!staticPageResponse.ok) {
      return new Response("Page not found", { status: 404 });
    }

    const html = await staticPageResponse.text();

    // Inject the template ID into the page so the client-side code can use it
    const updatedHtml = html.replace(
      "</head>",
      `
        <script>
          // Inject template ID for client-side use
          window.__TEMPLATE_ID__ = '${templateId}';
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
    console.error("Error in agents/mint/[template_id] function:", error);
    // Fallback to static page
    const baseUrl = new URL("/agents/mint", request.url);
    const staticPage = await fetch(baseUrl.toString());
    return new Response(await staticPage.text(), {
      headers: { "Content-Type": "text/html" },
    });
  }
}
