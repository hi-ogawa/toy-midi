import type { ScoreViewerRuntime } from "../components/score-viewer-runtime";
import type { EditorRuntime } from "./runtime";
import type { ToyMidiUtils } from "./toy-midi-utils";

// Agents that run page script, and the CLI in packages/cli in headless
// Chromium, drive the app through this global. Each page sets only the
// entries it serves.
export type ToyMidiGlobal = {
  runtime?: EditorRuntime;
  utils?: ToyMidiUtils;
  scoreViewer?: ScoreViewerRuntime;
};

declare global {
  interface Window {
    toyMidi?: ToyMidiGlobal;
  }
}
