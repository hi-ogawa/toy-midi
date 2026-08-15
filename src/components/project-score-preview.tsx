import { useMutation, useQuery } from "@tanstack/react-query";
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
  play: () => audioManager.play(),
  pause: () => audioManager.pause(),
  stop: () => {
    audioManager.pause();
    audioManager.seek(0);
  },
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
  const [runtime] = useState(
    () => new ScoreViewerRuntime({ clock: audioClock }),
  );
  const [isRuntimeAttached, setIsRuntimeAttached] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    runtime.attach(root);
    setIsRuntimeAttached(true);
    return () => runtime.dispose();
  }, [runtime]);

  const loadMutation = useMutation({
    mutationFn: () =>
      runtime.load({
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
            trimLeadingEmptyMeasures: false,
          }),
        },
        settings: {
          ...INITIAL_SCORE_VIEWER_SETTINGS,
          showTitle: false,
          showSectionLabels: true,
        },
      }),
  });

  useQuery({
    queryKey: [
      "project-score-preview",
      notes,
      tempo,
      title,
      timeSignature,
      keySignature,
      tabOpenStringPitches,
      locators,
    ],
    enabled: isRuntimeAttached && notes.length > 0,
    queryFn: async () => {
      await loadMutation.mutateAsync();
      return true;
    },
  });

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
