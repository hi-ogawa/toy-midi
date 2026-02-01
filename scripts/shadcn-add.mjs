import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);

const shadcn = spawn("pnpm", ["dlx", "shadcn@latest", "add", ...args], {
  stdio: "inherit",
});

shadcn.on("close", async (code) => {
  if (code !== 0) {
    process.exit(code ?? 1);
  }

  const { spawn } = await import("node:child_process");
  const rewrite = spawn(
    "node",
    [path.join(__dirname, "rewrite-src-imports.mjs")],
    { stdio: "inherit" },
  );

  rewrite.on("close", (rewriteCode) => {
    process.exit(rewriteCode ?? 0);
  });
});
