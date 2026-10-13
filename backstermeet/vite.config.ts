import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { backsterosMeetingsPlugin } from "./vite-plugin-backsteros-meetings.ts";
import { livekitHostTokenPlugin } from "./vite-plugin-livekit-token.ts";

const host = process.env.TAURI_DEV_HOST;
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const backsterosUiSrc = path.resolve(
  rootDir,
  "../backsteros/packages/ui/src",
);

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), livekitHostTokenPlugin(), backsterosMeetingsPlugin()],

  // Relative asset URLs so Tauri reload/refresh keeps finding /dist assets.
  base: "./",

  resolve: {
    alias: {
      // Shared meeting calendar glyph (same as desktop calendar events).
      "@backsteros/ui/meeting-calendar-status-icon": path.join(
        backsterosUiSrc,
        "components/calendar/meeting-calendar-status-icon.tsx",
      ),
    },
  },

  clearScreen: false,
  server: {
    // 1430 avoids clash with BacksterOS desktop (1420)
    port: 1430,
    strictPort: true,
    // Bind IPv4 explicitly — WebKit's localhost often prefers ::1 and NetworkErrors.
    host: host || "127.0.0.1",
    fs: {
      allow: [rootDir, backsterosUiSrc],
    },
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1431,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
