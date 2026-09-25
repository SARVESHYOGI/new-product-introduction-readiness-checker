import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow local browser automation (Playwright) to reach the dev server via
  // 127.0.0.1 as well as localhost. Without this, Next 16 blocks the HMR
  // WebSocket for "cross-origin" hosts and pages never hydrate in dev.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
