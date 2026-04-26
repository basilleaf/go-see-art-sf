import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "mfgr6xaj0mesjgcg.public.blob.vercel-storage.com",
      },
    ],
  },
};

export default nextConfig;
