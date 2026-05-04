import type { NextConfig } from "next";

/** Static export → deploy on Cloudflare Pages (output directory: `out`). */
const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
