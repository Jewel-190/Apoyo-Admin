import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { apoyoSecurityHeadersPlugin } from "./src/shared/lib/viteSecurityHeaders.js";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), apoyoSecurityHeadersPlugin()],
  preview: {
    allowedHosts: true,
  },
});
