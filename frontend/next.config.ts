import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-host build target. Emits .next/standalone/server.js with a minimal
  // node_modules — the Dockerfile copies that + .next/static + public, no
  // pnpm install in the runtime stage.
  output: "standalone",
  // cacheComponents disabled — pages still hit dynamic APIs (Date(), useProfile)
  // without Suspense/use-cache wrappers. Re-enable after sweep.
};

export default nextConfig;
