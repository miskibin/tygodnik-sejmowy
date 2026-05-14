import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-host build target. Emits .next/standalone/server.js with a minimal
  // node_modules — the Dockerfile copies that + .next/static + public, no
  // pnpm install in the runtime stage.
  output: "standalone",
  // cacheComponents disabled — pages still hit dynamic APIs (Date(), useProfile)
  // without Suspense/use-cache wrappers. Re-enable after sweep.
  productionBrowserSourceMaps: false,
  images: { formats: ["image/avif", "image/webp"] },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "radix-ui",
      "@base-ui/react",
      "date-fns",
      "recharts",
    ],
  },
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/:path*\\.(png|jpg|jpeg|svg|webp|avif|ico|woff2)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=2592000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
