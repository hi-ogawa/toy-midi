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
      entry: { "agent-api": "src/lib/agent-api.ts" },
      outDir: ".tmp/agent-api",
      platform: "browser",
      dts: { emitDtsOnly: true, compilerOptions: { stripInternal: true } },
      report: false,
    },
  ],
});
