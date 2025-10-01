import { cors } from "../utils/cors";
import { PagesFunction } from "@cloudflare/workers-types";

/**
 * @swagger
 * /api/swagger-ui:
 *   get:
 *     summary: Swagger UI interface
 *     description: Interactive API documentation interface
 *     operationId: getSwaggerUI
 *     tags:
 *       - API Documentation
 *     responses:
 *       200:
 *         description: Swagger UI HTML page
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *               description: HTML page with Swagger UI
 */

export const onRequestOptions: PagesFunction = async ({ request }) => {
  const headers = cors(request as Request);
  return new Response(null, { headers });
};

export const onRequestGet: PagesFunction = async ({ request }) => {
  const headers = cors(request as Request);

  const swaggerUIHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Passport Registry API - Swagger UI</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css" />
  <style>
    html {
      box-sizing: border-box;
      overflow: -moz-scrollbars-vertical;
      overflow-y: scroll;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin:0;
      background: #fafafa;
    }
    .swagger-ui .topbar {
      background-color: #1f2937;
    }
    .swagger-ui .topbar .download-url-wrapper {
      display: none;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: '/api/openapi-json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout",
        tryItOutEnabled: true,
        supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch'],
        onComplete: function() {
          console.log('Swagger UI loaded successfully');
        },
        onFailure: function(data) {
          console.error('Swagger UI failed to load:', data);
        }
      });
    };
  </script>
</body>
</html>`;

  return new Response(swaggerUIHtml, {
    status: 200,
    headers: {
      "content-type": "text/html",
      "cache-control": "public, max-age=3600", // Cache for 1 hour
      ...headers,
    },
  });
};
