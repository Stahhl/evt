import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Forward API and match WebSockets to `pnpm dev:server` (wrangler dev).
      "/api": { target: "http://localhost:8787", ws: true },
    },
  },
});
