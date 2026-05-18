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
  },
  staged: {
    "*": "vp check --fix",
  },
});
