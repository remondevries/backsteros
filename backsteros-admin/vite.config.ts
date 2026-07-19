import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** Ops UI at `backsteros.com/admin` — base path matches production nginx. */
export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/admin/",
  plugins: [tailwindcss(), react()],
  server: {
    port: 5174,
    strictPort: true,
  },
});
