import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Production: `/app` so the app is served at https://backsteros.com/app. Local next dev usually omits this. */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") || undefined;

const appDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(appDir, "..");

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
  },
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@backsteros/ui", "@backsteros/powersync-schema"],
};

export default nextConfig;
