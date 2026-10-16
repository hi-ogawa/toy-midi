// Download the bundled SoundFonts and their licenses from the `soundfonts-*`
// GitHub release into public/soundfonts/, reusing copies from the main git
// worktree when it has them.
//
// Usage:
//   tsx tools/fetch-soundfonts.ts

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// https://github.com/hi-ogawa/toy-midi/releases/tag/soundfonts-1
const RELEASE_URL =
  "https://github.com/hi-ogawa/toy-midi/releases/download/soundfonts-1";
const OUT_DIR = path.join(import.meta.dirname, "../public/soundfonts");

// File names carry a version because public/_headers caches them as immutable.
const FILES = [
  {
    name: "GeneralUserGS-2.0.3.sf3",
    sha256: "e2ed326ff44d15f78f2fdc72403b6fa6b77ee7266d3aad0d2198bc95797bc66c",
  },
  {
    name: "GeneralUserGS-2.0.3-LICENSE.txt",
    sha256: "2c3b923ff1f913f115d5457689156b6dcddc340a15772ea93b8dafcf0c3f3caa",
  },
];

async function main() {
  const mainWorktreeOutDir = path.join(findMainWorktree(), "public/soundfonts");
  await mkdir(OUT_DIR, { recursive: true });
  for (const file of FILES) {
    await fetchFile(file, mainWorktreeOutDir);
  }
}

function findMainWorktree(): string {
  const gitCommonDir = execFileSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { encoding: "utf8" },
  ).trim();
  return path.dirname(gitCommonDir);
}

async function fetchFile(
  file: { name: string; sha256: string },
  mainWorktreeOutDir: string,
) {
  const outPath = path.join(OUT_DIR, file.name);
  if (await readVerifiedFile(outPath, file.sha256)) {
    return;
  }
  const mainWorktreePath = path.join(mainWorktreeOutDir, file.name);
  const copied =
    mainWorktreePath !== outPath &&
    (await readVerifiedFile(mainWorktreePath, file.sha256));
  if (copied) {
    console.log(`Copying ${mainWorktreePath}`);
    await writeFile(outPath, copied);
    return;
  }
  const url = `${RELEASE_URL}/${file.name}`;
  const startedAt = performance.now();
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  const megabytes = (data.length / 1e6).toFixed(1);
  const milliseconds = Math.round(performance.now() - startedAt);
  console.log(`Downloaded ${url} (${megabytes} MB) in ${milliseconds} ms`);
  const sha256 = hashSha256(data);
  if (sha256 !== file.sha256) {
    throw new Error(
      `SHA-256 mismatch for ${file.name}: expected ${file.sha256}, got ${sha256}`,
    );
  }
  await writeFile(outPath, data);
}

async function readVerifiedFile(
  filePath: string,
  sha256: string,
): Promise<Buffer | undefined> {
  const data = await readFile(filePath).catch(() => undefined);
  return data && hashSha256(data) === sha256 ? data : undefined;
}

function hashSha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
