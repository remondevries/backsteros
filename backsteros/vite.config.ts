import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { visualizer } from "rollup-plugin-visualizer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { desktopManualChunks } from "./vite.manual-chunks";
import { backsterosVaultDevPlugin } from "./vite-plugin-vault-dev";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Browser Vite cannot call Tauri `owner_api_key`. For `vite` serve only, mirror
 * Tauri by reading ~/.config/backsteros/cli.env so cloud chat (agents door)
 * works the same as the installed app. Never inject into production builds.
 */
function readCliOwnerApiKey(): string | null {
  try {
    const envPath = path.join(os.homedir(), ".config/backsteros/cli.env");
    const text = fs.readFileSync(envPath, "utf8");
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || !line.startsWith("BACKSTEROS_API_KEY=")) {
        continue;
      }
      const value = line
        .slice("BACKSTEROS_API_KEY=".length)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      if (value.startsWith("sk_access_") || value.startsWith("sk_live_")) {
        return value;
      }
    }
  } catch {
    // Missing cli.env is fine — cloud chat stays empty until configured.
  }
  return null;
}

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
/** HTTPS public hostname in front of Vite (nginx). Mac/Tauri leave unset. */
const publicHost = (
  process.env.DEV_PUBLIC_HOST ||
  process.env.VITE_DEV_SERVER_HOST ||
  ""
).trim();
const bundleReport = process.env.BUNDLE_REPORT === "1";
// T3 Code HTTP API (Hetzner/Kamal discovery). Default matches backsterdev/scripts/dev-runner.ts.
const t3CodeHttpUrl = (
  process.env.VITE_T3CODE_URL ||
  process.env.T3CODE_HTTP_URL ||
  "http://127.0.0.1:13773"
).replace(/\/$/, "");

// https://vite.dev/config/
export default defineConfig(async ({ command }) => {
  if (command === "serve" && !process.env.VITE_OWNER_API_KEY?.trim()) {
    const fromCli = readCliOwnerApiKey();
    if (fromCli) {
      process.env.VITE_OWNER_API_KEY = fromCli;
    }
  }

  return {
  plugins: [
    backsterosVaultDevPlugin(__dirname),
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
    // UI is excluded (source-aliased), so Vite discovers its node deps at
    // runtime and re-optimizes → full reload loops. Force-include the
    // ChatThread stack via `parent > nested` (pnpm does not hoist these to
    // the desktop root).
    include: [
      "@backsteros/ui > @assistant-ui/react",
      "@backsteros/ui > @assistant-ui/react > @assistant-ui/core",
      "@backsteros/ui > @assistant-ui/react > @assistant-ui/store",
      "@backsteros/ui > @assistant-ui/react > @assistant-ui/tap",
      "@backsteros/ui > @assistant-ui/react > assistant-stream",
      "@backsteros/ui > @assistant-ui/react > assistant-cloud",
      "@backsteros/ui > @assistant-ui/react > zustand",
      "@backsteros/ui > @assistant-ui/react > radix-ui",
      "@backsteros/ui > @assistant-ui/react > react-textarea-autosize",
      "@backsteros/ui > @assistant-ui/react > safe-content-frame",
      "@legendapp/list/react",
      "@backsteros/ui > @legendapp/list/react",
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
    // MagicDNS `development` + Tailscale IP + optional HTTPS gateway (OS-148).
    // os.local.backsteros.com remains the Mac HTTPS gateway name.
    allowedHosts: [
      ".local.backsteros.com",
      "development",
      "100.126.31.97",
      ...(publicHost ? [publicHost] : []),
    ],
    // Do not set COEP/COOP here — cross-origin workers/scripts and
    // `require-corp` breaks session tokens (PowerSync then gets 401).
    proxy: {
      // Same-origin proxy so the Catalog side panel can read T3 Code
      // `/api/hetzner/*` without CORS friction during `dev:vite` / `tauri dev`.
      "/api/hetzner": {
        target: t3CodeHttpUrl,
        changeOrigin: true,
      },
      // SSE through Vite so browser streams do not fight REST for the
      // HTTP/1.1 6-connection cap on local-core :8788 (presence/email banners).
      ...Object.fromEntries(
        [
          "/api/v1/agent-presence/events",
          "/api/v1/email/events",
          "/api/v1/workspace/events",
          "/api/v1/chat/events",
        ].map((path) => [
          path,
          {
            target: (
              process.env.VITE_API_URL || "http://127.0.0.1:8788"
            ).replace(/\/$/, ""),
            changeOrigin: true,
            // Long-lived SSE — do not time out idle proxied sockets.
            timeout: 0,
            proxyTimeout: 0,
          },
        ]),
      ),
    },
    // Behind nginx TLS (`DEV_PUBLIC_HOST`): browser HMR over wss:443.
    // Direct Tailscale / Tauri (`TAURI_DEV_HOST` only): ws on :1421 (unchanged).
    hmr: publicHost
      ? {
          protocol: "wss",
          host: publicHost,
          clientPort: 443,
        }
      : host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
    watch: {
      // Ignore Tauri / generated UI dist. Dev aliases `@backsteros/ui` →
      // `packages/ui/src`, so watching `dist` only storms HMR (and leaks
      // memory) whenever `pnpm --filter @backsteros/ui build` rewrites it.
      ignored: [
        "**/src-tauri/**",
        "**/node_modules/**",
        "**/packages/ui/dist/**",
        "!**/node_modules/@backsteros/**",
      ],
    },
  },
};
});
