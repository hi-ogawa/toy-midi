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
// a project archive or a JSON file in the SharedProject format that share links
// carry, from disk or a URL.

const USAGE = `\
Usage: toy-midi render-audio <input> <output.wav> [--url URL]

<input> is a .toymidi.zip archive or a SharedProject .json file, as a path or
a URL. A /draft?src=<url> link renders the project at its src URL.`;

// Every ZIP archive starts with a local file header.
const ZIP_SIGNATURE = Buffer.from("PK\x03\x04", "latin1");

// Same-origin path the page fetches the input from. The app never serves it,
// because the CLI intercepts the request.
const INPUT_PATHNAME = "/__toy-midi-cli/input";

export async function runRenderAudio(args: string[]) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return;
  }
  const options = parseCliOptions(args);
  const input = await readInput(options.input);
  const isSharedProject = !input.subarray(0, 4).equals(ZIP_SIGNATURE);
  if (isSharedProject) {
    try {
      JSON.parse(input.toString());
    } catch {
      throw new Error(`${options.input} does not hold a readable project.`);
    }
  }

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
          ? utils!.convertSharedProject(await response.json())
          : await utils!.readProjectArchive(await response.blob());
        await runtime!.init();
        await runtime!.deserializeProject(project);
        const wav = utils!.encodeWav(await runtime!.renderMix());
        const link = document.createElement("a");
        link.href = URL.createObjectURL(wav);
        link.download = "output.wav";
        link.click();
      },
      { inputUrl, isSharedProject },
    ),
  ]);
  await download.saveAs(options.output);

  finishLine(
    `${style("green", "✓")} wrote ${style("cyan", options.output)}  ${style("dim", formatDuration(performance.now() - startedAt))}`,
  );
}

async function readInput(input: string): Promise<Buffer> {
  const url = resolveInputUrl(input);
  if (!url) {
    return readFile(input);
  }
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`Could not fetch the project from ${url}.`, {
      cause: error,
    });
  }
  if (!response.ok) {
    throw new Error(
      `Could not fetch the project from ${url} (HTTP ${response.status}).`,
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

function resolveInputUrl(input: string): string | undefined {
  if (!/^https?:\/\//.test(input)) {
    return undefined;
  }
  const url = new URL(input);
  const src = url.searchParams.get("src");
  // Resolve src as the app does, against the draft link's origin.
  if (url.pathname === "/draft" && src) {
    return new URL(src, url).href;
  }
  return url.href;
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
