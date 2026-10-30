import type { ScoreViewerRuntime } from "./components/score-viewer-runtime";
import { readProjectArchiveBlob } from "./lib/project-archive";
import { convertSharedProject } from "./lib/project-share";
import type { EditorRuntime } from "./lib/runtime";
import { encodeWav } from "./lib/wav";

declare global {
  interface Window {
    toyMidi: ToyMidiGlobal;
  }
}

export type ToyMidiGlobal = {
  utils: typeof toyMidiUtils;
  runtime?: EditorRuntime;
  /** @internal Agents have no use for it, so it stays out of their declarations. */
  scoreViewer?: ScoreViewerRuntime;
};

const toyMidiUtils = {
  convertSharedProject,
  readProjectArchiveBlob,
  encodeWav,
};

window.toyMidi = { utils: toyMidiUtils };
