import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The logo upload allows 2 MB; leave room for the multipart overhead.
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
};

export default nextConfig;
