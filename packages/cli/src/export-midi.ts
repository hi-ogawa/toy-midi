import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { DEFAULT_URL, launchBrowser } from "./browser";
import {
  openProjectPage,
  PROJECT_INPUT_USAGE,
  readProjectInput,
} from "./project-page";
import { finishLine, formatDuration, style, writeLine } from "./terminal";

// Write a project's MIDI tracks to a MIDI file, as the editor menu's Export
// MIDI does.

const USAGE = `\
Usage: toy-midi export-midi <input> <output.mid> [--url URL]

${PROJECT_INPUT_USAGE}`;

export async function runExportMidi(args: string[]) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return;
  }
  const options = parseCliOptions(args);
  const project = await readProjectInput(options.input);

  const startedAt = performance.now();
  writeLine(style("bold", "export-midi"));
  for (const [label, value] of [
    ["input", options.input],
    ["output", style("cyan", options.output)],
    ["app", options.url],
  ]) {
    writeLine(`  ${style("dim", label.padEnd(6))}  ${value}`);
  }
  writeLine("");

  await using browser = await launchBrowser();
  const page = await openProjectPage({ browser, url: options.url, project });
  // A MIDI file is small enough to return through evaluate.
  const bytes = await page.evaluate(() => {
    const { editor: runtime, editorUtils: utils } = window.__toyMidiCli!;
    return [...utils!.exportProjectMidi(runtime!.store.get())];
  });
  await writeFile(options.output, Uint8Array.from(bytes));

  finishLine(
    `${style("green", "✓")} wrote ${style("cyan", options.output)}  ${style("dim", formatDuration(performance.now() - startedAt))}`,
  );
}

function parseCliOptions(args: string[]) {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      url: { type: "string", default: DEFAULT_URL },
    },
  });
  const [input, output] = positionals;
  if (!input || !output || positionals.length > 2) {
    throw new Error(USAGE);
  }
  return { input, output, url: values.url };
}
