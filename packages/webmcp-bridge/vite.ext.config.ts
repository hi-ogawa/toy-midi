import { defineConfig } from "vite-plus";
import { DEFAULT_BRIDGE_PORT } from "./src/protocol.ts";

// Builds the extension into dist/extension, which loads unpacked: the
// manifest from public/, and each content script as one classic script,
// because content scripts cannot be modules. `WEBMCP_BRIDGE_PORT` sets the
// bridge port the content script connects to.
export default defineConfig({
  define: {
    __WEBMCP_BRIDGE_PORT__: JSON.stringify(
      process.env.WEBMCP_BRIDGE_PORT ?? String(DEFAULT_BRIDGE_PORT),
    ),
  },
  build: {
    outDir: "dist/extension",
    minify: false,
    rolldownOptions: {
      input: {
        content: "./src/extension/content.ts",
      },
      output: {
        format: "iife",
        entryFileNames: "[name].js",
      },
    },
  },
});
