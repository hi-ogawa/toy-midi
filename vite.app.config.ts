import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const OSMD_VIRTUAL_ID = "virtual:opensheetmusicdisplay";
const OSMD_RESOLVED_ID = `\0${OSMD_VIRTUAL_ID}`;
const osmdDirectory = path.resolve("node_modules/opensheetmusicdisplay");

export default defineConfig({
  plugins: [osmdPrebuilt(), react(), tailwindcss()],
  optimizeDeps: {
    // ignore late deps discovery through web worker import
    exclude: ["@hiogawa/bass-pitch-wasm"],
  },
});

function osmdPrebuilt(): Plugin {
  let osmdFileName: string;

  return {
    name: "osmd-prebuilt",
    async buildStart() {
      const osmdPackage = JSON.parse(
        await readFile(path.join(osmdDirectory, "package.json"), "utf8"),
      ) as { version: string };
      osmdFileName = `opensheetmusicdisplay-${osmdPackage.version}.js`;
      const vendorDirectory = path.resolve("public/vendor");
      await mkdir(vendorDirectory, { recursive: true });
      await copyFile(
        path.join(osmdDirectory, "build/opensheetmusicdisplay.min.js"),
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
        const osmdUrl = ${JSON.stringify(`/vendor/${osmdFileName}`)};
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
