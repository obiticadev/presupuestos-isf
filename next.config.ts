import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The logo upload allows 2 MB; leave room for the multipart overhead.
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  // The PDF font is read at runtime from this path (src/pdf/fonts.ts), which the trace cannot see.
  outputFileTracingIncludes: { "/*": ["./node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2"] },
};

export default nextConfig;
