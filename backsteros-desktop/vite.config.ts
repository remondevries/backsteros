import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [tailwindcss(), react(), wasm(), topLevelAwait()],

  optimizeDeps: {
    // Workspace UI must not be prebundled — otherwise dist rebuilds are ignored
    // until the Vite cache is cleared.
    exclude: [
      "@journeyapps/wa-sqlite",
      "@powersync/web",
      "@backsteros/ui",
      "@backsteros/contracts",
      "@backsteros/api-client",
      "@backsteros/powersync-schema",
    ],
  },

  // PowerSync workers code-split; Vite 7 defaults to iife which Rollup rejects.
  worker: {
    format: "es",
  },

  // Tauri webviews are modern; avoid downleveling that breaks TLA/wasm transforms.
  build: {
    target: "esnext",
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    // Do not set COEP/COOP here — Clerk loads cross-origin scripts/iframes and
    // `require-corp` breaks session tokens (PowerSync then gets 401).
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
