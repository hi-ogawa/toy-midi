import JSZip from "jszip";
import type { ScoreViewerRuntime } from "./components/score-viewer-runtime";
import { readProjectArchive } from "./lib/project-archive";
import { convertSharedProject } from "./lib/project-share";
import type { EditorRuntime } from "./lib/runtime";
import { encodeWav } from "./lib/wav";

// Agents that run page script, and the CLI in packages/cli in headless
// Chromium, drive the app through this global. Each page sets only the
// entries it serves.
export type ToyMidiGlobal = {
  runtime?: EditorRuntime;
  utils?: ToyMidiUtils;
  /** @internal Agents have no use for it, so it stays out of their declarations. */
  scoreViewer?: ScoreViewerRuntime;
};

declare global {
  interface Window {
    toyMidi?: ToyMidiGlobal;
  }
}

/** Helpers to compose with the runtime, kept off its API. */
export const toyMidiUtils = {
  convertSharedProject,
  readProjectArchive: async (archive: Blob) =>
    readProjectArchive(await JSZip.loadAsync(archive)),
  encodeWav,
};

export type ToyMidiUtils = typeof toyMidiUtils;
