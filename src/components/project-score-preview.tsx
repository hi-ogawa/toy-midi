import { useEffect, useRef, useState } from "react";
import { audioManager } from "../lib/audio";
import { exportMusicXml } from "../lib/musicxml/render";
import { useProjectStore } from "../lib/project-store";
import {
  INITIAL_SCORE_VIEWER_SETTINGS,
  type ScoreViewerClock,
  ScoreViewerRuntime,
} from "./score-viewer-runtime";

const audioClock: ScoreViewerClock = {
  getSnapshot: () => {
    const state = audioManager.store.get();
    return { currentTime: state.position, isPlaying: state.isPlaying };
  },
  subscribe: audioManager.store.subscribe,
  seek: (currentTime) => audioManager.seek(currentTime),
};

export function ProjectScorePreview({ title }: { title: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const {
    notes,
    tempo,
    timeSignature,
    keySignature,
    tabOpenStringPitches,
    locators,
  } = useProjectStore();
  const [runtime] = useState(() => new ScoreViewerRuntime(audioClock));

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    runtime.attach(root);
    return () => runtime.dispose();
  }, [runtime]);

  useEffect(() => {
    if (notes.length === 0) {
      return;
    }
    void runtime.load({
      score: {
        name: title,
        xml: exportMusicXml({
          notes,
          tempo,
          title,
          timeSignature,
          keySignature,
          openStringPitches: tabOpenStringPitches,
          locators,
        }),
      },
      settings: {
        ...INITIAL_SCORE_VIEWER_SETTINGS,
        showTitle: false,
        showSectionLabels: true,
      },
    });
  }, [
    keySignature,
    locators,
    notes,
    runtime,
    tabOpenStringPitches,
    tempo,
    timeSignature,
    title,
  ]);

  if (notes.length === 0) {
    return (
      <p className="p-6 text-sm text-neutral-400">
        Add a note to preview the score.
      </p>
    );
  }

  return (
    <div
      ref={rootRef}
      data-testid="project-score-preview"
      className="score-preview-runtime h-[28rem] w-[50rem] overflow-hidden bg-neutral-300 text-neutral-950"
    />
  );
}
