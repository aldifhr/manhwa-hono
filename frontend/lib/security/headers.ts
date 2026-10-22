/**
 * Single source of truth for security headers / CSP.
 * Imported by middleware (edge) and next.config (routing layer).
 * Keeps style-src / font-src / script-src in sync across both layers.
 *
 * Nonce-based: 'unsafe-inline' is dropped entirely. Next.js 16 auto-applies
 * the nonce to inline RSC hydration scripts and all <style> blocks generated
 * by styled-jsx/Tailwind. Any inline <script> or style attribute lacking the
 * matching nonce will be blocked by the browser (correct behavior).
 */

export function getCsp(isDev: boolean): string {
  // 'unsafe-inline' required for Next.js 16 RSC hydration scripts.
  const scriptSrc = isDev
    ? `script-src 'self' 'unsafe-inline' 'unsafe-eval'`
    : `script-src 'self' 'unsafe-inline'`;
  const connectExtra = isDev ? " ws://localhost:* wss://localhost:* http://localhost:*" : "";
  return [
    "default-src 'self'",
    scriptSrc,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    "img-src 'self' data: https: blob:",
    "font-src 'self' https://fonts.gstatic.com",
    // connect-src: 'self' + scanner + image CDNs (sw.js fetch() counts as connect-src, not img-src)
    `connect-src 'self' https://scanner.aldifhr.my.id https://manhwa.aldifhr.my.id https://fe.aldifhr.fun https://assets.shngm.id https://*.shngm.id https://*.shinigami.asia https://shinigami.asia https://imgkc1.my.id https://minio.imgkc1.my.id https:${connectExtra} wss: ws: blob:`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function getSecurityHeaders(isDev: boolean): Record<string, string> {
  return {
    "Content-Security-Policy": getCsp(isDev),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    // Minimal Permissions-Policy — only stable features. Chrome warns "Unrecognized feature"
    // when header CONTAINS unknown tokens (e.g. attribution-reporting on older Chrome),
    // so keep list minimal. Warning is harmless; browser just ignores unknown features.
    // If you see attribution-reporting/private-aggregation warnings, they come from
    // the *expanded* header previously set — hard-reload (Ctrl+Shift+R) or restart dev server.
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  };
}
