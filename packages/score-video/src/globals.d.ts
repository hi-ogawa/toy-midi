import type {
  ScoreSource,
  ScoreViewerRuntime,
} from "../../../src/components/score-viewer-runtime";

// The CLI drives the viewer's capture mode through these globals, so the video
// matches interactive playback.
declare global {
  interface Window {
    __toyMidiScoreViewer?: ScoreViewerRuntime;
    __toyMidiScoreViewerSource?: ScoreSource;
  }
}
