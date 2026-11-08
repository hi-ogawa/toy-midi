// Download the bundled SoundFonts and their licenses from the `soundfonts-*`
// GitHub release into public/soundfonts/, reusing copies from the main git
// worktree when it has them. Downloads go through the GitHub CLI when it is
// installed, so they are authenticated whenever it has a token, and fall back
// to a plain fetch otherwise.
//
// Usage:
//   tsx tools/fetch-soundfonts.ts

import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

// https://github.com/hi-ogawa/toy-midi/releases/tag/soundfonts-1
const REPO = "hi-ogawa/toy-midi";
const RELEASE_TAG = "soundfonts-1";
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
  {
    name: "FlameStudios-Telecaster-Bridge-SM-b50f761.sf3",
    sha256: "4e4cccb3d1ce252b821f6907c8c43a5432e991557aabd2f20d9e080ae8ad0f2f",
  },
  {
    name: "FlameStudios-Telecaster-Neck-SM-b50f761.sf3",
    sha256: "d53132c7b7951f5bf45e20b5f2c9e3c7234794be5efb693c07c71bb08badaac9",
  },
  {
    name: "FlameStudios-SM-b50f761-LICENSE.txt",
    sha256: "20c42f9a86c894c8a38204e0310f07bc69f47b5afb05ad1e01410c91c545ea7c",
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
  console.log(`Downloading ${file.name} from ${REPO}@${RELEASE_TAG}`);
  const startedAt = performance.now();
  const data = await downloadFile(file.name);
  const megabytes = (data.length / 1e6).toFixed(1);
  const milliseconds = Math.round(performance.now() - startedAt);
  console.log(`Downloaded in ${milliseconds} ms (${megabytes} MB)`);
  const sha256 = hashSha256(data);
  if (sha256 !== file.sha256) {
    throw new Error(
      `SHA-256 mismatch for ${file.name}: expected ${file.sha256}, got ${sha256}`,
    );
  }
  await writeFile(outPath, data);
}

async function downloadFile(name: string): Promise<Buffer> {
  try {
    const { stdout } = await promisify(execFile)(
      "gh",
      ["release", "download", RELEASE_TAG, "-R", REPO, "-p", name, "-O", "-"],
      { encoding: "buffer", maxBuffer: 1e9 },
    );
    return stdout;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  const url = `https://github.com/${REPO}/releases/download/${RELEASE_TAG}/${name}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
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
