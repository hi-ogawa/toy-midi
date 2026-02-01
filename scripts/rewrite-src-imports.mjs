import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();

const importPatterns = [
  /from\s+["'](src\/[^"']+)["']/g,
  /import\s+["'](src\/[^"']+)["']/g,
  /export\s+\*\s+from\s+["'](src\/[^"']+)["']/g,
];

async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
}

async function writeText(filePath, contents) {
  await fs.writeFile(filePath, contents, "utf8");
}

function toRelativeImport(fromFile, specifier) {
  if (!specifier.startsWith("src/")) return specifier;
  const absoluteTarget = path.join(projectRoot, specifier);
  let relativePath = path.relative(path.dirname(fromFile), absoluteTarget);
  relativePath = relativePath.split(path.sep).join("/");
  if (!relativePath.startsWith(".")) {
    relativePath = `./${relativePath}`;
  }
  return relativePath;
}

function rewriteImports(filePath, contents) {
  let updated = contents;
  for (const pattern of importPatterns) {
    updated = updated.replace(pattern, (match, specifier) => {
      const replacement = toRelativeImport(filePath, specifier);
      return match.replace(specifier, replacement);
    });
  }
  return updated;
}

async function collectFiles(dir, entries = []) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  for (const dirent of dirents) {
    const fullPath = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      await collectFiles(fullPath, entries);
    } else if (dirent.isFile()) {
      if (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx")) {
        entries.push(fullPath);
      }
    }
  }
  return entries;
}

async function main() {
  const targets = process.argv.slice(2);
  const files = targets.length
    ? targets.map((target) => path.resolve(projectRoot, target))
    : await collectFiles(path.join(projectRoot, "src"));

  await Promise.all(
    files.map(async (filePath) => {
      const original = await readText(filePath);
      const updated = rewriteImports(filePath, original);
      if (updated !== original) {
        await writeText(filePath, updated);
      }
    }),
  );
}

await main();
