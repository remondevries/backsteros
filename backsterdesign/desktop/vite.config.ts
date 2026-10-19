import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;
const desktopRoot = path.dirname(fileURLToPath(import.meta.url));
const uiPkg = path.resolve(desktopRoot, "../../backsteros/packages/ui");

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "./",
  clearScreen: false,
  envPrefix: ["VITE_", "PENPOT_"],
  resolve: {
    // Prefer the built package so HMR never loses `@backsteros/ui` mid-session.
    alias: {
      "@backsteros/ui/shell": path.join(uiPkg, "dist/entry/shell.js"),
      "@backsteros/ui": path.join(uiPkg, "dist/index.js"),
    },
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
