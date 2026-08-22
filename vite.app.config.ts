import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const require = createRequire(import.meta.url);
const OSMD_VIRTUAL_ID = "virtual:opensheetmusicdisplay";
const OSMD_RESOLVED_ID = `\0${OSMD_VIRTUAL_ID}`;

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
    resolveId(source) {
      if (source === OSMD_VIRTUAL_ID) {
        return OSMD_RESOLVED_ID;
      }
    },
    async load(id) {
      if (id !== OSMD_RESOLVED_ID) {
        return;
      }
      if (this.environment.mode === "dev") {
        return `export * from "opensheetmusicdisplay";`;
      }

      const source = await readFile(
        require.resolve("opensheetmusicdisplay/build/opensheetmusicdisplay.min.js"),
      );
      const referenceId = this.emitFile({
        type: "asset",
        name: "opensheetmusicdisplay.js",
        source,
      });
      return `
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = import.meta.ROLLUP_FILE_URL_${referenceId};
          script.onload = resolve;
          script.onerror = () => reject(new Error("Failed to load OSMD"));
          document.head.append(script);
        });
        export const { OpenSheetMusicDisplay } = globalThis.opensheetmusicdisplay;
      `;
    },
  };
}
