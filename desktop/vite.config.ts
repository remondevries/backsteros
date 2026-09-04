import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { visualizer } from "rollup-plugin-visualizer";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { desktopManualChunks } from "./vite.manual-chunks";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
const bundleReport = process.env.BUNDLE_REPORT === "1";

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    tailwindcss(),
    react(),
    wasm(),
    topLevelAwait(),
    bundleReport
      ? visualizer({
          filename: "dist/bundle-report.html",
          gzipSize: true,
          open: false,
        })
      : undefined,
  ].filter(Boolean),

  optimizeDeps: {
    // Workspace UI must not be prebundled — otherwise dist rebuilds are ignored
    // until the Vite cache is cleared.
    exclude: [
      "@journeyapps/wa-sqlite",
      "@powersync/web",
      "@backsteros/ui",
      "@backsteros/ui/shell",
      "@backsteros/ui/tasks",
      "@backsteros/ui/inbox",
      "@backsteros/ui/calendar",
      "@backsteros/ui/navigation",
      "@backsteros/contracts",
      "@backsteros/api-client",
      "@backsteros/powersync-schema",
    ],
  },

  // Resolve UI package to source in dev so HMR picks up edits without a
  // separate `pnpm --filter @backsteros/ui build` (package.json exports → dist).
  // Use exact / trailing-path finds — a bare "@backsteros/ui" string alias
  // would steal "@backsteros/ui/tailwind.css" → index.ts/tailwind.css.
  resolve: {
    alias: [
      {
        find: "@backsteros/ui/tailwind.css",
        replacement: path.resolve(
          __dirname,
          "packages/ui/src/tailwind.css",
        ),
      },
      {
        find: "@backsteros/ui/styles.css",
        replacement: path.resolve(__dirname, "packages/ui/src/styles.css"),
      },
      {
        find: "@backsteros/ui/shell",
        replacement: path.resolve(
          __dirname,
          "packages/ui/src/entry/shell.ts",
        ),
      },
      {
        find: "@backsteros/ui/tasks",
        replacement: path.resolve(
          __dirname,
          "packages/ui/src/entry/tasks.ts",
        ),
      },
      {
        find: "@backsteros/ui/inbox",
        replacement: path.resolve(
          __dirname,
          "packages/ui/src/entry/inbox.ts",
        ),
      },
      {
        find: "@backsteros/ui/calendar",
        replacement: path.resolve(
          __dirname,
          "packages/ui/src/entry/calendar.ts",
        ),
      },
      {
        find: "@backsteros/ui/navigation",
        replacement: path.resolve(
          __dirname,
          "packages/ui/src/entry/navigation.ts",
        ),
      },
      {
        find: /^@backsteros\/ui$/,
        replacement: path.resolve(__dirname, "packages/ui/src/index.ts"),
      },
    ],
  },

  // PowerSync workers code-split; Vite 7 defaults to iife which Rollup rejects.
  worker: {
    format: "es",
    plugins: () => [wasm(), topLevelAwait()],
  },

  // Tauri webviews are modern; avoid downleveling that breaks TLA/wasm transforms.
  build: {
    target: "esnext",
    rollupOptions: {
      output: {
        manualChunks: desktopManualChunks,
      },
    },
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
      // 3. tell Vite to ignore watching `src-tauri`, but keep workspace UI
      // packages watched so `pnpm --filter @backsteros/ui build` hot-reloads.
      ignored: [
        "**/src-tauri/**",
        "**/node_modules/**",
        "!**/node_modules/@backsteros/**",
      ],
    },
  },
}));
