import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // ignore late deps discovery through web worker import
    exclude: ["@hiogawa/bass-pitch-wasm"],
  },
});
