import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // xlsx is a CommonJS module — keep it out of the edge runtime
  serverExternalPackages: ["xlsx"],
};

export default nextConfig;
