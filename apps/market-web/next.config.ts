import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@openmarket/ui"],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
