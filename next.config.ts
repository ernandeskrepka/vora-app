import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["bullmq", "ioredis", "sharp", "@prisma/adapter-pg"],
  experimental: {
    // Uploads de criativo (carrossel com varios arquivos).
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
