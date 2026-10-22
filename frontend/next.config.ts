import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../../"),
  typescript: { ignoreBuildErrors: false },
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "scanner.aldifhr.my.id" },
      { protocol: "https", hostname: "manhwa.aldifhr.my.id" },
      { protocol: "https", hostname: "imgkc1.my.id" },
      { protocol: "https", hostname: "minio.imgkc1.my.id" },
      { protocol: "https", hostname: "assets.shngm.id" },
      { protocol: "https", hostname: "*.shngm.id" },
      { protocol: "https", hostname: "shinigami.asia" },
      { protocol: "https", hostname: "*.shinigami.asia" },
    ],
  },

  async redirects() {
    return [
      { source: "/dispatch-history", destination: "/notifications", permanent: true },
      { source: "/dispatch-history/:path*", destination: "/notifications", permanent: true },
      { source: "/history", destination: "/notifications", permanent: true },
    ];
  },
  async rewrites() {
    return [
      // Vercel → scanner proxy for API that lives on VPS (not on Vercel)
      { source: "/api/v1/failed-dispatches/:path*", destination: "https://scanner.aldifhr.my.id/api/v1/failed-dispatches/:path*" },
      { source: "/api/v1/failed-dispatches", destination: "https://scanner.aldifhr.my.id/api/v1/failed-dispatches" },
      { source: "/api/v1/logs/:path*", destination: "https://scanner.aldifhr.my.id/api/v1/logs/:path*" },
      { source: "/api/v1/queue/:path*", destination: "https://scanner.aldifhr.my.id/api/v1/queue/:path*" },
      { source: "/api/v1/queue", destination: "https://scanner.aldifhr.my.id/api/v1/queue" },
      { source: "/api/v1/health/detailed", destination: "https://scanner.aldifhr.my.id/api/v1/health/detailed" },
      { source: "/api/v1/auth/:path*", destination: "https://scanner.aldifhr.my.id/api/v1/auth/:path*" },
      { source: "/api/v1/auth", destination: "https://scanner.aldifhr.my.id/api/v1/auth" },
      { source: "/api/v1/continue-reading/:path*", destination: "https://scanner.aldifhr.my.id/api/v1/continue-reading/:path*" },
      { source: "/api/v1/audit/:path*", destination: "https://scanner.aldifhr.my.id/api/v1/audit/:path*" },
      { source: "/api/v1/audit", destination: "https://scanner.aldifhr.my.id/api/v1/audit" },
      { source: "/api/v1/enrich/:path*", destination: "https://scanner.aldifhr.my.id/api/v1/enrich/:path*" },
      { source: "/api/v1/reader/badge-counts", destination: "https://scanner.aldifhr.my.id/api/v1/reader/badge-counts" },
      { source: "/api/v1/reader/cover", destination: "https://scanner.aldifhr.my.id/api/v1/reader/cover" },
      { source: "/api/v1/reader/proxy", destination: "https://scanner.aldifhr.my.id/api/v1/reader/proxy" },
      { source: "/api/v1/reader/cover-img", destination: "https://scanner.aldifhr.my.id/api/v1/reader/cover-img" },
      { source: "/api/v1/reader/refresh-cover", destination: "https://scanner.aldifhr.my.id/api/v1/reader/refresh-cover" },
      { source: "/api/v1/reader/proxy", destination: "https://scanner.aldifhr.my.id/api/v1/reader/proxy" },
      { source: "/api/v1/reader/cover", destination: "https://scanner.aldifhr.my.id/api/v1/reader/cover" },
      { source: "/api/v1/recommended", destination: "https://scanner.aldifhr.my.id/api/v1/recommended" },
      { source: "/api/v1/catalog/:path*", destination: "https://scanner.aldifhr.my.id/api/v1/catalog/:path*" },
      { source: "/api/v1/catalog", destination: "https://scanner.aldifhr.my.id/api/v1/catalog" },
      { source: "/api/auth/:path*", destination: "/api/v1/auth/:path*" },
      {
        source: "/api/excluded-titles/:path*",
        destination: "/api/v1/excluded-titles/:path*",
      },
      {
        source: "/api/excluded-titles",
        destination: "/api/v1/excluded-titles",
      },
      {
        source: "/api/v1/dashboard-snapshot",
        destination: "/api/v1/dashboard/snapshot",
      },
      {
        source: "/api/v1/reader/rss/:path*",
        destination: "/api/v1/rss/:path*",
      },
      { source: "/api/v1/reader/rss", destination: "/api/v1/rss" },
      // Explicit legacy -> canonical v1 mappings
      { source: "/api/reader/stats", destination: "/api/v1/stats" },
      { source: "/api/reader/queue", destination: "/api/v1/queue" },
      {
        source: "/api/reader/dashboard",
        destination: "/api/v1/dashboard/snapshot",
      },
      {
        source: "/api/reader/catalog/resolve",
        destination: "/api/v1/catalog/resolve",
      },
      {
        source: "/api/reader/cron/status",
        destination: "/api/v1/cron/status",
      },
      {
        source: "/api/reader/activity/heatmap",
        destination: "/api/v1/analytics/engagement",
      },
      { source: "/api/reader/cover-img", destination: "/api/v1/reader/cover" },
      // Catch-all for remaining /api/reader/* -> /api/v1/reader/*
      { source: "/api/reader/:path*", destination: "/api/v1/reader/:path*" },
    ];
  },
  async headers() {
    return [
      // Default: no-store for all routes (prevents stale cache after deploy).
      // Specific routes below (images, etc.) can override Cache-Control.
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https: blob:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://scanner.aldifhr.my.id https://manhwa.aldifhr.my.id https://assets.shngm.id https://*.shngm.id https://*.shinigami.asia https://shinigami.asia https://imgkc1.my.id https://minio.imgkc1.my.id https: wss: ws: blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
      // Images: override no-store with 24h cache (covers change rarely)
      {
        source: "/api/v1/reader/cover",
        headers: [
          { key: "Content-Type", value: "image/webp" },
          {
            key: "Cache-Control",
            value: "public, max-age=3600, s-maxage=3600, stale-while-revalidate=3600",
          },
        ],
      },
      {
        source: "/api/v1/reader/proxy",
        headers: [
          { key: "Content-Type", value: "image/webp" },
          {
            key: "Cache-Control",
            value: "public, max-age=60, s-maxage=60, must-revalidate",
          },
        ],
      },
      // Dynamic APIs: no-store (redundant with default, but explicit) — private session data
      {
        source: "/api/v1/dispatch-history",
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Cache-Control", value: "private, no-store, must-revalidate" },
          { key: "Vary", value: "Cookie" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        source: "/api/v1/dashboard-snapshot",
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Cache-Control", value: "private, max-age=30, stale-while-revalidate=60" },
          { key: "Vary", value: "Cookie" },
        ],
      },
      // Public / semi-public: allow stale-while-revalidate, private karena credentials: include
      // Jangan asal public — response bisa beda per filter (type/source) & per session (whitelist flag)
      {
        source: "/api/v1/rss",
        headers: [
          { key: "Cache-Control", value: "private, max-age=30, stale-while-revalidate=60" },
          { key: "Vary", value: "Cookie" },
        ],
      },
      {
        source: "/api/v1/reader/rss",
        headers: [
          { key: "Cache-Control", value: "private, max-age=30, stale-while-revalidate=60" },
          { key: "Vary", value: "Cookie" },
        ],
      },
      {
        source: "/api/public/stats",
        headers: [
          { key: "Cache-Control", value: "public, max-age=60, stale-while-revalidate=120" },
        ],
      },
      {
        source: "/api/v1/sources/health",
        headers: [
          { key: "Cache-Control", value: "private, max-age=30, stale-while-revalidate=60" },
          { key: "Vary", value: "Cookie" },
        ],
      },
    ];
  },
};

export default nextConfig;
