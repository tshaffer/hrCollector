import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Bind to 0.0.0.0 (not just localhost) so another device on the same
    // network can load the dev server.
    host: true
  }
});
