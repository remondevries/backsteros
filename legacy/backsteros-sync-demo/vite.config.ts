import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    exclude: ["@powersync/web", "@journeyapps/wa-sqlite"],
  },
  worker: {
    format: "es",
  },
});
