import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV !== "production";

function origin(url: string | undefined): string | undefined {
  try {
    return url ? new URL(url).origin : undefined;
  } catch {
    return undefined;
  }
}

const auth0 = process.env.NEXT_PUBLIC_AUTH0_DOMAIN
  ? `https://${process.env.NEXT_PUBLIC_AUTH0_DOMAIN}`
  : undefined;
const api = origin(process.env.NEXT_PUBLIC_API_URL);

/**
 * Content Security Policy, fixed at build time from the public config.
 * - Auth0: sign-in redirects (form-action), the silent-renew iframe
 *   (frame-src), and token calls (connect-src).
 * - Uploads go straight to signed GCS URLs; locally to MinIO on localhost.
 * - Next inlines its bootstrap scripts and the reading-settings script, so
 *   scripts need 'unsafe-inline'; development also needs 'unsafe-eval' and
 *   localhost websockets for hot reload.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  [
    "connect-src 'self'",
    api,
    auth0,
    "https://storage.googleapis.com",
    isDevelopment ? "http://localhost:* ws://localhost:*" : undefined,
  ]
    .filter(Boolean)
    .join(" "),
  ["frame-src", auth0 ?? "'none'"].join(" "),
  ["form-action 'self'", auth0].filter(Boolean).join(" "),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  // Production is HTTPS-only behind the load balancer.
  ...(isDevelopment
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]),
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
