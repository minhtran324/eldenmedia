import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,

  // ── Compression & output ────────────────────────────────────────────
  compress: true,

  // ── HTTP Caching Headers ───────────────────────────────────────────
  async headers() {
    return [
      // Service Worker — never cached
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      // Offline fallback — revalidate every request
      {
        source: "/offline.html",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
      // App icons & PWA assets — cache 7 days, revalidate in background
      {
        source: "/icons/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" },
        ],
      },
      // Company images served from /image/* — cache 1 day
      {
        source: "/image/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=3600" },
        ],
      },
      // API routes — no cache by default (each route can override)
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      // Counts belong to the signed-in recipient; never share them through a CDN.
      {
        source: "/api/notifications/counts",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
        ],
      },
      // Security headers for all pages
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },

  // ── Allowed origins for Cloudflare Quick Tunnel dev ───────────────
  allowedDevOrigins: [
    "flow-remembered-street-favor.trycloudflare.com",
  ],

  // ── Image optimisation ────────────────────────────────────────────
  images: {
    formats: ["image/webp", "image/avif"],
    // Local /image/* files are served via API routes, not next/image directly
    minimumCacheTTL: 86400,
  },
};

export default nextConfig;
