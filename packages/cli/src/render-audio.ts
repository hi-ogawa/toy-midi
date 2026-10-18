import { parseArgs } from "node:util";
import { DEFAULT_URL, launchBrowser } from "./browser";
import {
  openProjectPage,
  PROJECT_INPUT_USAGE,
  readProjectInput,
} from "./project-page";
import {
  finishLine,
  formatDuration,
  rewriteLine,
  style,
  writeLine,
} from "./terminal";

// Render a project's mix offline in the app, as Export Audio does.

const USAGE = `\
Usage: toy-midi render-audio <input> <output.wav> [--url URL]

${PROJECT_INPUT_USAGE}`;

export async function runRenderAudio(args: string[]) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return;
  }
  const options = parseCliOptions(args);
  const project = await readProjectInput(options.input);

  const startedAt = performance.now();
  writeLine(style("bold", "render-audio"));
  for (const [label, value] of [
    ["input", options.input],
    ["output", style("cyan", options.output)],
    ["app", options.url],
  ]) {
    writeLine(`  ${style("dim", label.padEnd(6))}  ${value}`);
  }
  writeLine("");
  rewriteLine(`${style("dim", "⋯")} rendering`);

  await using browser = await launchBrowser();
  const page = await openProjectPage({ browser, url: options.url, project });
  // Pass the WAV out as a download rather than through evaluate, which
  // serializes bytes inefficiently. A 3-minute WAV is about 35 MB.
  const [download] = await Promise.all([
    // Rendering takes longer for longer projects, so wait without a timeout.
    page.waitForEvent("download", { timeout: 0 }),
    page.evaluate(async () => {
      const { editor: runtime, editorUtils: utils } = window.__toyMidiCli!;
      const wav = utils!.encodeWav(await runtime!.renderMix());
      const link = document.createElement("a");
      link.href = URL.createObjectURL(wav);
      link.download = "output.wav";
      link.click();
    }),
  ]);
  await download.saveAs(options.output);

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
