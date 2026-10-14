import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    // Three.js is most of the bundle (about 700 kB minified). Split it out
    // when load time on mobile starts to matter.
    chunkSizeWarningLimit: 1000,
  },
  server: {
    proxy: {
      // Forward API and match WebSockets to `pnpm dev:server` (wrangler dev).
      "/api": { target: "http://localhost:8787", ws: true },
    },
  },
});
