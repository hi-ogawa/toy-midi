import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite-plus";
import { DEFAULT_BRIDGE_PORT } from "./src/protocol.ts";

// Builds the extension into dist/extension, which loads unpacked: the
// manifest from public/, and each script as one classic script in its own
// build, because extension scripts cannot be modules here and a classic
// script cannot share chunks. `WEBMCP_BRIDGE_PORT` sets the bridge port the
// content script connects to, and `PATCH_MANIFEST=true` names a CI build
// after its pull request and commit.
export default defineConfig({
  define: {
    __WEBMCP_BRIDGE_PORT__: JSON.stringify(
      process.env.WEBMCP_BRIDGE_PORT ?? String(DEFAULT_BRIDGE_PORT),
    ),
  },
  build: {
    outDir: "dist/extension",
    minify: false,
  },
  environments: {
    content: scriptBuild("content", "./src/extension/content.ts"),
    // Keep the content build's output, which already has public/.
    background: scriptBuild("background", "./src/extension/background.ts", {
      emptyOutDir: false,
      copyPublicDir: false,
    }),
  },
  builder: {
    async buildApp(builder) {
      await builder.build(builder.environments.content!);
      await builder.build(builder.environments.background!);

      if (process.env.PATCH_MANIFEST === "true") {
        const revision = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
          encoding: "utf8",
        }).trim();
        const prMatch = process.env.GITHUB_REF?.match(/refs\/pull\/(\d+)\//);
        const manifestPath = path.resolve(
          builder.config.root,
          builder.config.build.outDir,
          "manifest.json",
        );
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        manifest.name = prMatch
          ? `WebMCP Bridge [PR#${prMatch[1]} ${revision}]`
          : `WebMCP Bridge [${revision}]`;
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      }
    },
  },
});

function scriptBuild(
  name: string,
  input: string,
  build?: { emptyOutDir: boolean; copyPublicDir: boolean },
) {
  return {
    consumer: "client" as const,
    build: {
      ...build,
      rolldownOptions: {
        input: { [name]: input },
        output: {
          format: "iife" as const,
          entryFileNames: "[name].js",
        },
      },
    },
  };
}
