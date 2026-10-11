import type { ScoreViewerRuntime } from "../../../src/components/score-viewer-runtime";

// The CLI drives the score capture page through this global, so the video
// matches interactive playback.
declare global {
  interface Window {
    __toyMidiScoreViewer?: ScoreViewerRuntime;
  }
}
