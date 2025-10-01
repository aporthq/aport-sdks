export const onRequest: PagesFunction = async (context) => {
  const svg = `
<svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="primaryGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#ffffff;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#f8fafc;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="accentGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#22d3ee;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#06b6d4;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="subtleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1e293b;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#334155;stop-opacity:0.8" />
    </linearGradient>
  </defs>

  <circle cx="60" cy="60" r="58" fill="url(#subtleGradient)" stroke="url(#primaryGradient)" stroke-width="1.5"/>

  <g transform="translate(60, 60)">
    <path d="M-24,-32 L24,-32 L18,-8 L-18,-8 Z" 
          fill="url(#primaryGradient)" 
          stroke="url(#primaryGradient)" 
          stroke-width="0.5"/>

    <rect x="-12" y="-4" width="24" height="8" fill="url(#accentGradient)" rx="1"/>

    <path d="M-18,8 L18,8 L12,24 L-12,24 Z" 
          fill="url(#primaryGradient)" 
          stroke="url(#primaryGradient)" 
          stroke-width="0.5"/>
  </g>

  <circle cx="60" cy="60" r="3" fill="url(#accentGradient)" opacity="0.8"/>

  <circle cx="60" cy="60" r="45" fill="none" stroke="url(#accentGradient)" stroke-width="0.5" opacity="0.3"/>
</svg>`;

  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
