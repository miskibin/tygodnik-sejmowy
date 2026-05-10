import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents disabled — pages still hit dynamic APIs (Date(), useProfile)
  // without Suspense/use-cache wrappers. Re-enable after sweep.
};

export default nextConfig;
