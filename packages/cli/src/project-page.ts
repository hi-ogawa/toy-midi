import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import type { Browser } from "playwright-core";
import { openCliPage } from "./browser";

// Commands that take a project read it from a project archive or a JSON file
// in the SharedProject format that share links carry, from disk, a URL, or a
// share link, and load it into a bare editor runtime.

export const PROJECT_INPUT_USAGE = `\
<input> is a .toymidi.zip archive or a SharedProject .json file, as a path or
a URL, or a share link: /draft#p=<payload>, or /draft?src=<url> for the
project at its src URL.`;

// Every ZIP archive starts with a local file header.
const ZIP_SIGNATURE = Buffer.from("PK\x03\x04", "latin1");

// Same-origin path the page fetches the input from. The app never serves it,
// because the CLI intercepts the request.
const INPUT_PATHNAME = "/__toy-midi-cli/input";

export async function readProjectInput(input: string) {
  const bytes = await readInput(input);
  const isSharedProject = !bytes.subarray(0, 4).equals(ZIP_SIGNATURE);
  if (isSharedProject) {
    try {
      JSON.parse(bytes.toString());
    } catch {
      throw new Error(`${input} does not hold a readable project.`);
    }
  }
  return { bytes, isSharedProject };
}

// Open the editor CLI page with the project loaded into its runtime.
export async function openProjectPage({
  browser,
  url,
  project,
}: {
  browser: Browser;
  url: string;
  project: Awaited<ReturnType<typeof readProjectInput>>;
}) {
  const page = await openCliPage({
    browser,
    url,
    pathname: "/editor-cli",
    api: "editor",
  });
  // Pass the project in as a request rather than through evaluate, which
  // serializes bytes inefficiently.
  const inputUrl = new URL(INPUT_PATHNAME, url).href;
  await page.route(inputUrl, (route) => route.fulfill({ body: project.bytes }));
  await page.evaluate(
    async ({ inputUrl, isSharedProject }) => {
      const { editor: runtime, editorUtils: utils } = window.__toyMidiCli!;
      const response = await fetch(inputUrl);
      const state = isSharedProject
        ? utils!.convertSharedProject(await response.json())
        : await utils!.readProjectArchive(await response.blob());
      await runtime!.init();
      await runtime!.deserializeProject(state);
    },
    { inputUrl, isSharedProject: project.isSharedProject },
  );
  return page;
}

async function readInput(input: string): Promise<Buffer> {
  if (!/^https?:\/\//.test(input)) {
    return readFile(input);
  }
  const url = new URL(input);
  if (url.pathname === "/draft") {
    // A share link carries the project in its fragment, which a request never
    // sends, so decode it here as the app does.
    const payload = new URLSearchParams(url.hash.slice(1)).get("p");
    if (payload) {
      try {
        return inflateRawSync(Buffer.from(payload, "base64url"));
      } catch {
        throw new Error("The share link does not hold a readable project.");
      }
    }
    // Resolve src as the app does, against the draft link's origin.
    const src = url.searchParams.get("src");
    if (src) {
      return fetchInput(new URL(src, url).href);
    }
  }
  return fetchInput(url.href);
}

async function fetchInput(url: string): Promise<Buffer> {
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
