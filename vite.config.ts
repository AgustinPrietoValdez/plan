import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    // bind all interfaces so both desktop (localhost) and phone (LAN IP) can reach it;
    // omitting hmr.host lets Vite infer it from the browser's own location.hostname,
    // so the same server works for both without env vars.
    host: "0.0.0.0",
    hmr: {
      protocol: "ws",
      port: 1421,
      timeout: 120000,
    },
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
