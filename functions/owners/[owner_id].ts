// Cloudflare Pages Function for dynamic owner routes
export async function onRequest(context: any) {
  const { request, params } = context;
  const ownerId = params.owner_id;

  try {
    // Get the base URL for the static site
    const baseUrl = new URL(request.url);
    baseUrl.pathname = "/owners";
    baseUrl.search = `?owner_id=${ownerId}`;

    // Fetch the Next.js static page with the owner ID as a query parameter
    const staticPageResponse = await fetch(baseUrl.toString());

    if (!staticPageResponse.ok) {
      return new Response("Page not found", { status: 404 });
    }

    const html = await staticPageResponse.text();

    // Inject the owner ID into the page so the client-side code can use it
    const updatedHtml = html.replace(
      "</head>",
      `
        <script>
          // Inject owner ID for client-side use
          window.__OWNER_ID__ = '${ownerId}';
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
    console.error("Error in owners/[owner_id] function:", error);
    // Fallback to static page
    const baseUrl = new URL("/owners", request.url);
    const staticPage = await fetch(baseUrl.toString());
    return new Response(await staticPage.text(), {
      headers: { "Content-Type": "text/html" },
    });
  }
}
