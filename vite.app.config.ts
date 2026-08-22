import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const require = createRequire(import.meta.url);
const OSMD_VIRTUAL_ID = "virtual:opensheetmusicdisplay";
const OSMD_RESOLVED_ID = `\0${OSMD_VIRTUAL_ID}`;
const osmdPackage = require("opensheetmusicdisplay/package.json") as {
  version: string;
};
const osmdFileName = `opensheetmusicdisplay-${osmdPackage.version}.js`;
const osmdPublicPath = `/vendor/${osmdFileName}`;

export default defineConfig({
  plugins: [osmdPrebuilt(), react(), tailwindcss()],
  optimizeDeps: {
    // ignore late deps discovery through web worker import
    exclude: ["@hiogawa/bass-pitch-wasm"],
  },
});

function osmdPrebuilt(): Plugin {
  return {
    name: "osmd-prebuilt",
    async buildStart() {
      const vendorDirectory = path.resolve("public/vendor");
      await mkdir(vendorDirectory, { recursive: true });
      await copyFile(
        require.resolve("opensheetmusicdisplay/build/opensheetmusicdisplay.min.js"),
        path.join(vendorDirectory, osmdFileName),
      );
    },
    resolveId(source) {
      if (source === OSMD_VIRTUAL_ID) {
        return OSMD_RESOLVED_ID;
      }
    },
    load(id) {
      if (id !== OSMD_RESOLVED_ID) {
        return;
      }
      return `
        const osmdUrl = ${JSON.stringify(osmdPublicPath)};
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = osmdUrl;
          script.onload = resolve;
          script.onerror = () => reject(new Error("Failed to load OSMD"));
          document.head.append(script);
        });
        export const { OpenSheetMusicDisplay } = globalThis.opensheetmusicdisplay;
      `;
    },
  };
}
