import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import fs from "node:fs";

const outDir = path.resolve(import.meta.dirname, "dist");
const publicJs = path.resolve(
  import.meta.dirname,
  "../frontend/resources/public/js",
);
const publicCss = path.resolve(
  import.meta.dirname,
  "../frontend/resources/public/css",
);

/**
 * Keep island CSS from resetting / retheming the whole Penpot document.
 * Product-shell tokens must also land on portaled overlays (dropdowns,
 * due-date calendar) — those mount on document.body outside the island.
 */
const ISLAND_TOKEN_HOSTS = [
  ".backsteros-project-tasks.bos-product-shell",
  "[data-searchable-dropdown-panel]",
  "[data-due-date-calendar-popover]",
  "[data-pinned-task-popover]",
  "[data-task-link-modal]",
  "[data-entity-header-action-menu]",
].join(",");

function sanitizeIslandCss(css: string): string {
  let out = css;
  out = out.replaceAll(":root,.bos-product-shell", ISLAND_TOKEN_HOSTS);
  out = out.replaceAll(":root, .bos-product-shell", ISLAND_TOKEN_HOSTS);
  // Drop Tailwind Preflight if it ever sneaks back in.
  out = out.replace(/@layer\s+base\s*\{[\s\S]*?\n\}/g, "");
  return out;
}

function copyToPenpotPublic() {
  return {
    name: "copy-to-penpot-public",
    closeBundle() {
      fs.mkdirSync(publicJs, { recursive: true });
      fs.mkdirSync(publicCss, { recursive: true });
      for (const name of fs.readdirSync(outDir)) {
        const src = path.join(outDir, name);
        if (!fs.statSync(src).isFile()) continue;
        if (name.endsWith(".css")) {
          const dest = path.join(publicCss, "backsteros-project-tasks.css");
          const css = sanitizeIslandCss(fs.readFileSync(src, "utf8"));
          fs.writeFileSync(dest, css);
          continue;
        }
        // lib mode may emit `backsteros-project-tasks` without .js
        if (
          name === "backsteros-project-tasks" ||
          name === "backsteros-project-tasks.js"
        ) {
          fs.copyFileSync(
            src,
            path.join(publicJs, "backsteros-project-tasks.js"),
          );
          continue;
        }
        if (
          name === "backsteros-project-tasks.map" ||
          name === "backsteros-project-tasks.js.map"
        ) {
          fs.copyFileSync(
            src,
            path.join(publicJs, "backsteros-project-tasks.js.map"),
          );
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), copyToPenpotPublic()],
  // IIFE runs in Penpot's browser — Node `process` does not exist there.
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env": JSON.stringify({ NODE_ENV: "production" }),
  },
  build: {
    outDir,
    emptyOutDir: true,
    cssCodeSplit: false,
    sourcemap: true,
    minify: true,
    lib: {
      entry: path.resolve(import.meta.dirname, "src/project-tasks-mount.tsx"),
      name: "BacksterDesignProjectTasks",
      formats: ["iife"],
      fileName: () => "backsteros-project-tasks",
    },
  },
});
