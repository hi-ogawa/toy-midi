import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite-plus";

// Generated with `pnpm generate-extension-key`. It fixes the extension's ID,
// which `EXTENSION_ORIGIN` in src/protocol.ts names for the bridge to accept.
// Changing it changes the ID, so installs lose the sites already allowed.
const EXTENSION_PUBLIC_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtTOvknLd9H0b/0oxIUsLNVuujq8EOjPkrTzx3Gm2BMfp2QcPT5L19+A79/gWb/Ew+NZonGPWk5hEYiD+0lwhbnXioiovyMAFKweWB5fkWyM9i1fUzmsp09KX4u9akXtyQSfyaLTlcAu0WnOgdbXX542aRiWhxIGW0T5V+SKvRTQQGRYv8ggx5HRO6fYs0HtQG5ZQKBgcHstuaDkazQaf0B7OA3M5+LrM5eoNLyljgBwbzIG3PwoDGMo5LdA4N4wyNGTBnEqtu7ZQWgvcNsbEpYY55lyhOWj2lU1fxUDiib38GvbfT2rOvhTqRFGtaQuSD7cvAhz3NRxHMrRM3mrGVQIDAQAB";

// Builds the extension into dist/extension, which loads unpacked: the
// manifest from public/, and each script as one classic script in its own
// build, because extension scripts cannot be modules here and a classic
// script cannot share chunks. `PATCH_MANIFEST=true` names a CI build after its
// pull request and commit.
export default defineConfig({
  build: {
    outDir: "dist/extension",
    minify: false,
  },
  environments: {
    content: scriptBuild("content", "./src/extension/content.ts"),
    // Later builds keep the content build's output, which already has public/.
    background: scriptBuild("background", "./src/extension/background.ts", {
      emptyOutDir: false,
      copyPublicDir: false,
    }),
    relay: scriptBuild("relay", "./src/extension/relay.ts", {
      emptyOutDir: false,
      copyPublicDir: false,
    }),
    offscreen: scriptBuild("offscreen", "./src/extension/offscreen.ts", {
      emptyOutDir: false,
      copyPublicDir: false,
    }),
  },
  builder: {
    async buildApp(builder) {
      await builder.build(builder.environments.content!);
      await builder.build(builder.environments.background!);
      await builder.build(builder.environments.relay!);
      await builder.build(builder.environments.offscreen!);

      const manifestPath = path.resolve(
        builder.config.root,
        builder.config.build.outDir,
        "manifest.json",
      );
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      manifest.key = EXTENSION_PUBLIC_KEY;
      if (process.env.PATCH_MANIFEST === "true") {
        const revision = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
          encoding: "utf8",
        }).trim();
        const prMatch = process.env.GITHUB_REF?.match(/refs\/pull\/(\d+)\//);
        manifest.name = prMatch
          ? `WebMCP Bridge [PR#${prMatch[1]} ${revision}]`
          : `WebMCP Bridge [${revision}]`;
      }
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
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
