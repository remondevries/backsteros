import type { NextConfig } from "next";
import path from "node:path";

/** Production: `/app` so the app is served at https://backsteros.com/app. Local next dev usually omits this. */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") || undefined;

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd(), ".."),
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@backsteros/ui", "@backsteros/powersync-schema"],
};

export default nextConfig;
