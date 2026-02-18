import type { NextConfig } from "next";

const nextConfig = {
  experimental: {
    turbopack: {
      root: '.',
    },
  },
};

export default nextConfig;
