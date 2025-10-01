export const cors = (req: Request) => {
  // Safety check for undefined request
  if (!req || !req.headers) {
    return {
      "access-control-allow-origin": "*",
      "access-control-allow-headers":
        "authorization, content-type, if-none-match, if-modified-since, x-requested-with",
      "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "access-control-allow-credentials": "true",
      "access-control-max-age": "86400",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-XSS-Protection": "1; mode=block",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    };
  }

  const origin = req.headers.get("origin");

  // For verify endpoint, allow specific origins for security
  const allowedOrigins = [
    "https://aport.io",
    "https://aport.io",
    "https://api.aport.io",
    "https://api.aport.io",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002", // Added port 3002 for Next.js dev server
    "http://localhost:8787",
  ];

  const allowedOrigin =
    origin && allowedOrigins.includes(origin)
      ? origin
      : "http://localhost:3000";

  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-headers":
      "authorization, content-type, if-none-match, if-modified-since, x-requested-with",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-allow-credentials": "true", // Allow credentials
    "access-control-max-age": "86400", // 24 hours
    // Security headers
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
};
