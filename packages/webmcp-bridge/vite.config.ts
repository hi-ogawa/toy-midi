import { defineConfig } from "vite-plus";
import { DEFAULT_BRIDGE_PORT } from "./src/protocol.ts";

// Builds the extension into a directory that loads unpacked: the manifest
// from extension/, and the content script as one classic script, because
// content scripts cannot be modules. `WEBMCP_BRIDGE_PORT` sets the bridge
// port the content script connects to.
export default defineConfig({
  publicDir: "extension",
  define: {
    __WEBMCP_BRIDGE_PORT__: JSON.stringify(
      process.env.WEBMCP_BRIDGE_PORT ?? String(DEFAULT_BRIDGE_PORT),
    ),
  },
  build: {
    outDir: "dist/extension",
    // Keep the script readable in the browser's devtools.
    minify: false,
    lib: {
      entry: "src/extension.ts",
      formats: ["iife"],
      name: "webmcpBridge",
      fileName: () => "content-script.js",
    },
  },
});
