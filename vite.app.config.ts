import { readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss(), serveAgentGuide()],
  optimizeDeps: {
    // ignore late deps discovery through web worker import
    exclude: ["@hiogawa/bass-pitch-wasm"],
  },
});

// The agent guide and the declaration files it links to, by served path. The
// declaration files come from `pnpm build-webmcp-tools-doc`.
const AGENT_GUIDE_FILES: Record<string, string> = {
  "llms.txt": "docs/llms.md",
  "llms/runtime.d.ts": ".tmp/webmcp-tools-doc/webmcp-tools-doc.d.ts",
  "llms/project.d.ts": ".tmp/project-format-doc/project-format-doc.d.ts",
};

function serveAgentGuide(): Plugin {
  return {
    name: "serve-agent-guide",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const source = AGENT_GUIDE_FILES[req.url?.slice(1) ?? ""];
        if (!source) {
          return next();
        }
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(readFileSync(source));
      });
    },
    generateBundle() {
      for (const [fileName, source] of Object.entries(AGENT_GUIDE_FILES)) {
        this.emitFile({
          type: "asset",
          fileName,
          source: readFileSync(source, "utf8"),
        });
      }
    },
  };
}
