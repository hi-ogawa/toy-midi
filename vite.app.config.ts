import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

export default defineConfig({
  plugins: [osmdPrebuilt(), react(), tailwindcss()],
  optimizeDeps: {
    // ignore late deps discovery through web worker import
    exclude: ["@hiogawa/bass-pitch-wasm"],
  },
});

function osmdPrebuilt(): Plugin {
  const OSMD_VIRTUAL_ID = "virtual:opensheetmusicdisplay";
  const OSMD_RESOLVED_ID = `\0${OSMD_VIRTUAL_ID}`;
  let osmdFileName: string;

  return {
    name: "osmd-prebuilt",
    configResolved() {
      const osmdDirectory = path.resolve("node_modules/opensheetmusicdisplay");
      const osmdPackage = JSON.parse(
        readFileSync(path.join(osmdDirectory, "package.json"), "utf8"),
      );
      osmdFileName = `opensheetmusicdisplay-${osmdPackage.version}.js`;
      const vendorDirectory = path.resolve("public/vendor");
      mkdirSync(vendorDirectory, { recursive: true });
      copyFileSync(
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
