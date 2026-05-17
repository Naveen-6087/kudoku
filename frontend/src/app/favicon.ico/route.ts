const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <radialGradient id="lava" cx="32" cy="22" r="34" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffcf6b" />
      <stop offset="0.42" stop-color="#ff7b45" />
      <stop offset="1" stop-color="#1f0b0b" />
    </radialGradient>
  </defs>
  <rect width="64" height="64" rx="16" fill="url(#lava)" />
  <path
    d="M22 15h10l-7 14 17 20H31l-9-11-5 11H8l9-19 5-15Zm17 0h17l-6 10H36l3-10Z"
    fill="#fff4ca"
  />
</svg>
`.trim();

export function GET() {
  return new Response(SVG, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400"
    }
  });
}
