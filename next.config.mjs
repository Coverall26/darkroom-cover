import { withBotId } from 'botid/next/config';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  pageExtensions: ["js", "jsx", "ts", "tsx", "mdx"],
  
  // Build optimizations for memory-constrained environments
  productionBrowserSourceMaps: false, // Disable source maps to save memory
  experimental: {
    // Reduce memory pressure during build
    workerThreads: false,
    cpus: 1,
  },
  
  // TypeScript errors are caught by `npm run typecheck` in CI.
  // Do NOT set ignoreBuildErrors: true — it hides real issues.
  typescript: {
    ignoreBuildErrors: false,
  },
  
  images: {
    minimumCacheTTL: 2592000, // 30 days
    remotePatterns: prepareRemotePatterns(),
  },
  skipTrailingSlashRedirect: true,
  // NOTE: assetPrefix removed — it was set to NEXT_PUBLIC_BASE_URL (fundroom.ai) which caused
  // cross-origin loading failures on app.fundroom.ai and custom domains. Vercel serves all
  // configured domains from the same deployment, so relative asset URLs work correctly.
  async redirects() {
    return [
      ...(process.env.NEXT_PUBLIC_APP_BASE_HOST
        ? [
            {
              source: "/",
              destination: "/login",
              permanent: false,
              has: [
                {
                  type: "host",
                  value: process.env.NEXT_PUBLIC_APP_BASE_HOST,
                },
              ],
            },
          ]
        : []),
      // Legacy settings → admin settings center (all /settings/* pages removed)
      { source: "/settings", destination: "/admin/settings", permanent: false },
      { source: "/settings/general", destination: "/admin/settings", permanent: false },
      { source: "/settings/billing", destination: "/admin/settings", permanent: false },
      { source: "/settings/billing/invoices", destination: "/admin/settings", permanent: false },
      { source: "/settings/upgrade", destination: "/admin/settings", permanent: false },
      { source: "/settings/ai", destination: "/admin/settings", permanent: false },
      { source: "/settings/agreements", destination: "/admin/settings", permanent: false },
      { source: "/settings/data-migration", destination: "/admin/settings", permanent: false },
      { source: "/settings/domains", destination: "/admin/settings", permanent: false },
      { source: "/settings/email", destination: "/admin/settings", permanent: false },
      { source: "/settings/funds", destination: "/admin/settings", permanent: false },
      { source: "/settings/incoming-webhooks", destination: "/admin/settings", permanent: false },
      { source: "/settings/investor-timeline", destination: "/admin/settings", permanent: false },
      { source: "/settings/people", destination: "/admin/settings", permanent: false },
      { source: "/settings/presets", destination: "/admin/settings", permanent: false },
      { source: "/settings/presets/:path*", destination: "/admin/settings", permanent: false },
      { source: "/settings/sign", destination: "/admin/settings", permanent: false },
      { source: "/settings/signature-audit", destination: "/admin/settings", permanent: false },
      { source: "/settings/tags", destination: "/admin/settings", permanent: false },
      { source: "/settings/tokens", destination: "/admin/settings", permanent: false },
      { source: "/settings/webhooks", destination: "/admin/settings", permanent: false },
      { source: "/settings/webhooks/:path*", destination: "/admin/settings", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        // API routes: strict no-cache
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
          {
            key: "Expires",
            value: "0",
          },
        ],
      },
      {
        // Dynamic pages: private no-cache allows ETag-based 304 responses
        // Excludes static assets which have their own immutable caching rules
        source: "/((?!_next/static|_next/image|fonts|icons|favicon).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
        ],
      },
      {
        source: "/view/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex",
          },
        ],
      },
      ...(process.env.NEXT_PUBLIC_WEBHOOK_BASE_HOST
        ? [
            {
              source: "/services/:path*",
              has: [
                {
                  type: "host",
                  value: process.env.NEXT_PUBLIC_WEBHOOK_BASE_HOST,
                },
              ],
              headers: [
                {
                  key: "X-Robots-Tag",
                  value: "noindex",
                },
              ],
            },
          ]
        : []),
      {
        source: "/api/webhooks/services/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex",
          },
        ],
      },
      {
        source: "/unsubscribe",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex",
          },
        ],
      },
      {
        // Service worker - never cache to ensure updates are immediate
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
      {
        // Manifest - short cache to pick up updates
        source: "/manifest.json",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600",
          },
        ],
      },
    ];
  },
  allowedDevOrigins: [
    "localhost:5000",
    "127.0.0.1:5000",
    "0.0.0.0:5000",
    "*.replit.dev",
    "*.spock.replit.dev",
    "*.repl.co",
  ],
  serverExternalPackages: ["nodemailer"],
  outputFileTracingIncludes: {
    "/api/mupdf/*": ["./node_modules/mupdf/dist/*.wasm"],
  },
  turbopack: {},
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        dns: false,
        tls: false,
        child_process: false,
      };
    }
    return config;
  },
};

function prepareRemotePatterns() {
  let patterns = [
    // FundRoom AI platform domains
    { protocol: "https", hostname: "fundroom.ai" },
    { protocol: "https", hostname: "*.fundroom.ai" },
    // twitter img
    { protocol: "https", hostname: "pbs.twimg.com" },
    // linkedin img
    { protocol: "https", hostname: "media.licdn.com" },
    // google img
    { protocol: "https", hostname: "lh3.googleusercontent.com" },
    // useragent img
    { protocol: "https", hostname: "faisalman.github.io" },
    // Replit Object Storage
    { protocol: "https", hostname: "*.replit.app" },
    { protocol: "https", hostname: "objectstorage.replit.app" },
  ];

  // Default region patterns
  if (process.env.NEXT_PRIVATE_UPLOAD_DISTRIBUTION_HOST) {
    patterns.push({
      protocol: "https",
      hostname: process.env.NEXT_PRIVATE_UPLOAD_DISTRIBUTION_HOST,
    });
  }

  if (process.env.NEXT_PRIVATE_ADVANCED_UPLOAD_DISTRIBUTION_HOST) {
    patterns.push({
      protocol: "https",
      hostname: process.env.NEXT_PRIVATE_ADVANCED_UPLOAD_DISTRIBUTION_HOST,
    });
  }

  // US region patterns
  if (process.env.NEXT_PRIVATE_UPLOAD_DISTRIBUTION_HOST_US) {
    patterns.push({
      protocol: "https",
      hostname: process.env.NEXT_PRIVATE_UPLOAD_DISTRIBUTION_HOST_US,
    });
  }

  if (process.env.NEXT_PRIVATE_ADVANCED_UPLOAD_DISTRIBUTION_HOST_US) {
    patterns.push({
      protocol: "https",
      hostname: process.env.NEXT_PRIVATE_ADVANCED_UPLOAD_DISTRIBUTION_HOST_US,
    });
  }

  if (process.env.VERCEL_ENV === "production") {
    patterns.push({
      // production vercel blob
      protocol: "https",
      hostname: "yoywvlh29jppecbh.public.blob.vercel-storage.com",
    });
  }

  if (
    process.env.VERCEL_ENV === "preview" ||
    process.env.NODE_ENV === "development"
  ) {
    patterns.push({
      // staging vercel blob
      protocol: "https",
      hostname: "36so9a8uzykxknsu.public.blob.vercel-storage.com",
    });
  }

  return patterns;
}

export default withBotId(nextConfig);

