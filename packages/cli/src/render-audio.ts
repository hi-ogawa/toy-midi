import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { DEFAULT_URL, launchBrowser, openCliPage } from "./browser";
import {
  finishLine,
  formatDuration,
  rewriteLine,
  style,
  writeLine,
} from "./terminal";

// Render a project's mix offline in the app, as Export Audio does. The input is
// a project archive, or a .json file in the SharedProject format that share
// links carry.

const USAGE =
  "Usage: toy-midi render-audio <input.toymidi.zip|input.json> <output.wav> [--url URL]";

// Same-origin path the page fetches the input from. The app never serves it,
// because the CLI intercepts the request.
const INPUT_PATHNAME = "/__toy-midi-cli/input";

export async function runRenderAudio(args: string[]) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return;
  }
  const options = parseCliOptions(args);
  const input = await readFile(options.input);

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
  const page = await openCliPage({
    browser,
    url: options.url,
    pathname: "/editor-cli",
    api: "editor",
  });
  // Pass the project in and the WAV out as a request and a download rather
  // than through evaluate, which serializes bytes inefficiently. A 3-minute
  // WAV is about 35 MB.
  const inputUrl = new URL(INPUT_PATHNAME, options.url).href;
  await page.route(inputUrl, (route) => route.fulfill({ body: input }));
  const [download] = await Promise.all([
    // Rendering takes longer for longer projects, so wait without a timeout.
    page.waitForEvent("download", { timeout: 0 }),
    page.evaluate(
      async ({ inputUrl, isSharedProject }) => {
        const { editor: runtime, editorUtils: utils } = window.__toyMidiCli!;
        const response = await fetch(inputUrl);
        const project = isSharedProject
          ? utils!.assignSharedProjectIds(await response.json())
          : await utils!.readProjectArchive(await response.blob());
        await runtime!.init();
        await runtime!.deserializeProject(project);
        const wav = utils!.encodeWav(await runtime!.renderMix());
        const link = document.createElement("a");
        link.href = URL.createObjectURL(wav);
        link.download = "output.wav";
        link.click();
      },
      { inputUrl, isSharedProject: options.input.endsWith(".json") },
    ),
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
