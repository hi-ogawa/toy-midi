import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "vite-plus";
import { DEFAULT_BRIDGE_PORT } from "./src/protocol.ts";

// Builds the extension into dist/extension, which loads unpacked: the
// manifest from public/, and each content script as one classic script,
// because content scripts cannot be modules. `WEBMCP_BRIDGE_PORT` sets the
// bridge port the content script connects to, and `PATCH_MANIFEST=true` names
// a CI build after its pull request and commit.
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
  builder: {
    async buildApp(builder) {
      await builder.build(builder.environments.client!);

      if (process.env.PATCH_MANIFEST === "true") {
        const revision = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
          encoding: "utf8",
        }).trim();
        const prMatch = process.env.GITHUB_REF?.match(/refs\/pull\/(\d+)\//);
        const manifestPath = "dist/extension/manifest.json";
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        manifest.name = prMatch
          ? `WebMCP Bridge [PR#${prMatch[1]} ${revision}]`
          : `WebMCP Bridge [${revision}]`;
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      }
    },
  },
});
