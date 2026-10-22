// Render each track of the reverb demo pieces on its own through the app, by
// muting every other track, so a reverb can be applied afterwards on a shared
// send bus. Uses the `toy-midi render-audio` CLI, about 12 s per stem, and
// skips stems already rendered, so an interrupted run can resume.
//
// Usage:
//   tsx tools/reverb-ab/render-stems.ts [--out .tmp/reverb-ab] [--jobs 4]

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

const CATALOG =
  "https://raw.githubusercontent.com/hi-ogawa/llm-music-probe/main/compositions/catalog.json";

// The genre spread from #934's reverb demo candidates.
export const PIECES = [
  "Open E Mixolydian",
  "Orchestral Dilla",
  "Corner Store Thirds",
  "Night Drive in D♭",
  "Clichê",
  "Tide Engine",
  "Tidepool",
];

export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  const { values } = parseArgs({
    options: {
      out: { type: "string", default: ".tmp/reverb-ab" },
      jobs: { type: "string", default: "4" },
    },
  });
  const outDir = path.resolve(values.out);
  const catalog: { name: string; url: string }[] = await (
    await fetch(CATALOG)
  ).json();
  const jobs: { project: string; wav: string }[] = [];
  for (const name of PIECES) {
    const entry = catalog.find((e) => e.name === name);
    if (!entry) {
      throw new Error(`${name} is not in the catalog`);
    }
    const project = await (await fetch(entry.url)).json();
    const dir = path.join(outDir, slugify(name));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "project.json"), JSON.stringify(project));
    for (let i = 0; i < project.midiTracks.length; i++) {
      const solo = structuredClone(project);
      solo.midiTracks.forEach((t: { muted?: boolean }, j: number) => {
        t.muted = j !== i;
      });
      const stem = path.join(dir, String(i).padStart(2, "0"));
      await writeFile(`${stem}.json`, JSON.stringify(solo));
      if (!existsSync(`${stem}.wav`)) {
        jobs.push({ project: `${stem}.json`, wav: `${stem}.wav` });
      }
    }
  }
  console.log(`${jobs.length} stems to render`);
  const cli = path.join(import.meta.dirname, "../../packages/cli/bin/cli.js");
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const code = await new Promise<number | null>((resolve) =>
        spawn("node", [cli, "render-audio", job.project, job.wav], {
          stdio: "ignore",
        }).on("close", resolve),
      );
      console.log(`${code === 0 ? "ok" : "FAILED"} ${job.wav}`);
    }
  };
  await Promise.all(
    Array.from({ length: Number(values.jobs) }, () => worker()),
  );
}

if (import.meta.main) {
  await main();
}
