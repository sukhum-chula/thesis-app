import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options",    value: "nosniff" },
  { key: "X-Frame-Options",           value: "DENY" },
  { key: "X-XSS-Protection",          value: "1; mode=block" },
  { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",        value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // unsafe-eval needed by Next.js dev
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      `img-src 'self' data: blob: ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}`,
      `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}`,
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // The finance-form generator reads its .docx template from disk at request time; file tracing
  // can't see an fs.readFile path, so ship the template with that route explicitly.
  outputFileTracingIncludes: {
    "/api/submissions/*/finance-attach": ["./templates/**/*"],
    "/api/submissions/*/cover-memo": ["./templates/**/*"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
