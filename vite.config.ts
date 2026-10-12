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
      entry: { "toy-midi": "src/lib/llms-types.ts" },
      outDir: "public/llms",
      platform: "browser",
      dts: { emitDtsOnly: true, compilerOptions: { stripInternal: true } },
      report: false,
    },
  ],
});
