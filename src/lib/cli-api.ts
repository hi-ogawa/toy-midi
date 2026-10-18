import type { ScoreViewerRuntime } from "../components/score-viewer-runtime";

// The CLI in packages/cli opens bare pages of the app in headless Chromium and
// drives them through this global. Each page sets only the entry it serves.
export type CliApi = {
  scoreViewer?: ScoreViewerRuntime;
};

declare global {
  interface Window {
    __toyMidiCli?: CliApi;
  }
}
