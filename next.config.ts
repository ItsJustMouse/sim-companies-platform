import type { NextConfig } from 'next';

/**
 * Content Security Policy.
 *
 * `img-src` intentionally allows the official Sim Companies asset origin so product
 * artwork can be referenced directly rather than re-hosted (see docs/ASSETS.md).
 * `'unsafe-inline'` for styles is required by Next.js' streaming style injection.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https://www.simcompanies.com https://d1fxi9dsu3ff2t.cloudfront.net",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  // Next.js requires 'unsafe-inline' for its bootstrap script; dev additionally needs eval.
  process.env.NODE_ENV === 'development'
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "manifest-src 'self'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // We maintain our own CLAUDE.md / AGENTS.md, which point at docs/BUILD_STATE.md.
  agentRules: false,
  poweredByHeader: false,
  output: 'standalone',
  serverExternalPackages: ['postgres', 'ioredis'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'www.simcompanies.com' },
      { protocol: 'https', hostname: 'd1fxi9dsu3ff2t.cloudfront.net' },
    ],
    formats: ['image/webp'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
