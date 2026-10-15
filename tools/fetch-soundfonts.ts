// Download the bundled SoundFonts and their licenses from the `soundfonts-*`
// GitHub release into public/soundfonts/.
//
// Usage:
//   tsx tools/fetch-soundfonts.ts

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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

await mkdir(OUT_DIR, { recursive: true });
for (const file of FILES) {
  await fetchFile(file);
}

async function fetchFile(file: { name: string; sha256: string }) {
  const outPath = path.join(OUT_DIR, file.name);
  const existing = await readFile(outPath).catch(() => undefined);
  if (existing && hashSha256(existing) === file.sha256) {
    return;
  }
  const url = `${RELEASE_URL}/${file.name}`;
  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  const sha256 = hashSha256(data);
  if (sha256 !== file.sha256) {
    throw new Error(
      `SHA-256 mismatch for ${file.name}: expected ${file.sha256}, got ${sha256}`,
    );
  }
  await writeFile(outPath, data);
}

function hashSha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
