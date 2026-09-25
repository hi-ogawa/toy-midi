// Contract between the score viewer's capture mode and the score video CLI.
// The CLI can run against a deployed app built from a different commit, so
// bump the version whenever the bridge shape or behavior changes.
export const SCORE_CAPTURE_BRIDGE_VERSION = 1;

export type ScoreCaptureBridge = {
  version: number;
  load: (source: { name: string; xml: string }) => Promise<void>;
  getDuration: () => number;
  seek: (seconds: number) => void;
};

declare global {
  interface Window {
    __toyMidiScoreCapture?: ScoreCaptureBridge;
  }
}
