import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    printWidth: 80,
    sortImports: {
      newlinesBetween: false,
      partitionByNewline: true,
      groups: [["builtin"], ["external"]],
    },
  },
  lint: {
    categories: {
      correctness: "off",
    },
    rules: {
      curly: "error",
    },
  },
  staged: {
    "*": "vp check --fix",
  },
  pack: [
    {
      entry: { "webmcp-tools-doc": "src/lib/webmcp-tools-doc.ts" },
      outDir: ".tmp/webmcp-tools-doc",
      platform: "browser",
      dts: { emitDtsOnly: true, compilerOptions: { stripInternal: true } },
      report: false,
    },
  ],
});
