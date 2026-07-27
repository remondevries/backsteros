import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Production: `/admin` so the app is served at https://backsteros.com/admin. Local next dev usually omits this. */
const basePath =
  process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") || undefined;

const appDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(appDir, "..");

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
  },
  transpilePackages: [
    "@backsteros/ui",
    "@backsteros/api-client",
    "@backsteros/contracts",
  ],
};

export default nextConfig;
