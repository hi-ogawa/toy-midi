import JSZip from "jszip";
import type { ScoreViewerRuntime } from "./components/score-viewer-runtime";
import { readProjectArchive } from "./lib/project-archive";
import { convertSharedProject } from "./lib/project-share";
import type { EditorRuntime } from "./lib/runtime";
import { encodeWav } from "./lib/wav";

// Agents that run page script, and the CLI in packages/cli in headless
// Chromium, drive the app through this global. Each page attaches only the
// runtime it serves.
export type ToyMidiGlobal = {
  utils: ToyMidiUtils;
  runtime?: EditorRuntime;
  /** @internal Agents have no use for it, so it stays out of their declarations. */
  scoreViewer?: ScoreViewerRuntime;
};

declare global {
  interface Window {
    toyMidi: ToyMidiGlobal;
  }
}

/** Helpers to compose with the runtime, kept off its API. */
const toyMidiUtils = {
  convertSharedProject,
  readProjectArchive: async (archive: Blob) =>
    readProjectArchive(await JSZip.loadAsync(archive)),
  encodeWav,
};

export type ToyMidiUtils = typeof toyMidiUtils;

window.toyMidi = { utils: toyMidiUtils };
