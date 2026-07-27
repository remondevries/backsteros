import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(appDir, "..");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Tauri loads http://127.0.0.1:3100 — allow HMR / dev resources from that origin.
  allowedDevOrigins: ["127.0.0.1"],
  // pnpm workspace lockfile lives one level up; both roots must match (Next 16.2+).
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
  },
  transpilePackages: [
    "@backsteros/ui",
    "@backsteros/api-client",
    "@backsteros/contracts",
    "@primer/octicons-react",
  ],
};

export default nextConfig;
