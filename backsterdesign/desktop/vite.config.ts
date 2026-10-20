import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;
const desktopRoot = path.dirname(fileURLToPath(import.meta.url));
const uiPkg = path.resolve(desktopRoot, "../../backsteros/packages/ui");

/** Owner key from ~/.config/backsteros/cli.env when Vite env is unset. */
function readCliEnvValue(key: string): string {
  try {
    const filePath = path.join(os.homedir(), ".config", "backsteros", "cli.env");
    if (!fs.existsSync(filePath)) return "";
    const text = fs.readFileSync(filePath, "utf8");
    const match = new RegExp(`^(?:export\\s+)?${key}=(.+)$`, "m").exec(text);
    return match?.[1]?.trim().replace(/^['"]|['"]$/g, "") || "";
  } catch {
    return "";
  }
}

const cloudCoreUrl =
  process.env.VITE_BACKSTEROS_CORE_URL?.trim() ||
  "https://agent.backsteros.com";
const cloudApiKey =
  process.env.VITE_BACKSTEROS_API_KEY?.trim() ||
  readCliEnvValue("BACKSTEROS_API_KEY");

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "./",
  clearScreen: false,
  envPrefix: ["VITE_", "PENPOT_"],
  define: {
    "import.meta.env.VITE_BACKSTEROS_CORE_URL": JSON.stringify(cloudCoreUrl),
    "import.meta.env.VITE_BACKSTEROS_API_KEY": JSON.stringify(cloudApiKey),
  },
  resolve: {
    // Prefer the built package so HMR never loses `@backsteros/ui` mid-session.
    // Always load timer provider + hooks from the same entry (`@backsteros/ui`)
    // so React context is not duplicated across `/shell` vs main.
    alias: {
      "@backsteros/ui/shell": path.join(uiPkg, "dist/entry/shell.js"),
      "@backsteros/ui": path.join(uiPkg, "dist/index.js"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    // Linked workspace package — prebundling splits context modules apart.
    exclude: ["@backsteros/ui", "@backsteros/ui/shell"],
  },
  server: {
    // 1440 avoids BacksterOS (1420) and BacksterMeet (1430)
    port: 1440,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1441,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
