import path from "node:path";

import type { NextConfig } from "next";

// Supabase origin (for CSP connect-src / img-src). Empty in demo/no-backend mode.
let supabaseOrigin = "";
try {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (url) supabaseOrigin = new URL(url).origin;
} catch {
  // Malformed URL → leave empty; the report-only CSP just falls back to 'self'.
}
const supabaseWs = supabaseOrigin.replace(/^https/, "wss");

/**
 * Report-Only Content-Security-Policy. It OBSERVES violations (browser console)
 * without blocking anything, so it can't white-screen the app. Watch the console
 * in prod, then promote to an enforcing `Content-Security-Policy` header — and
 * prefer nonces over 'unsafe-inline' for script-src when you do.
 * `'unsafe-inline'/'unsafe-eval'` reflect what Next.js currently needs (inline
 * bootstrap + dev eval); inline styles come from `style={{…}}` usage.
 */
const cspReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigin}`.trim(),
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseWs}`.trim(),
]
  .join("; ")
  .replace(/\s+/g, " ");

const securityHeaders = [
  // Enforcing anti-clickjacking. `frame-ancestors 'none'` is the modern form and
  // this single CSP directive is safe (it doesn't restrict scripts/styles/fetch).
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // HTTPS-only for ~180 days. Ignored over http (localhost), so dev is unaffected.
  {
    key: "Strict-Transport-Security",
    value: "max-age=15552000; includeSubDomains",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Full policy in report-only so violations surface without breaking anything.
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
];

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. Without it Next infers the root
  // from the nearest lockfile ABOVE the project too: a stray, empty
  // package-lock.json in the user's home folder made it pick the whole home
  // folder, and the dev server watched and cached all of it until it ran out
  // of memory (8 GB) — twice, the second time with the app idle.
  // process.cwd(), not __dirname: Next compiles this file elsewhere, and
  // __dirname there pointed at the home folder again ("Can't resolve
  // 'tailwindcss' in C:\Users\…"). `next dev` / `next build` run from here.
  turbopack: { root: path.resolve(process.cwd()) },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
