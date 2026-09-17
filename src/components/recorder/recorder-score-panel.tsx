import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { usePointerDrag } from "../../hooks/use-pointer-drag";
import { clamp } from "../../lib/music";
import { exportMusicXml } from "../../lib/musicxml/render";
import type {
  MidiTrackState,
  RecorderRuntime,
  RecorderRuntimeState,
} from "../../lib/recorder/runtime";
import {
  INITIAL_SCORE_VIEWER_SETTINGS,
  ScoreViewerRuntime,
} from "../score-viewer-runtime";
import { RecorderPanel } from "./recorder-panel";

export function useRecorderScorePanelUi() {
  const [openTracks, setOpenTracks] = useState<ReadonlySet<string>>(new Set());
  function open(id: string) {
    setOpenTracks((current) => new Set([...current, id]));
  }
  function close(id: string) {
    setOpenTracks((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }
  return { openTracks, open, close };
}

export function RecorderScorePanel({
  runtime,
  state,
  track,
  onClose,
}: {
  runtime: RecorderRuntime;
  state: RecorderRuntimeState;
  track: MidiTrackState;
  onClose: () => void;
}) {
  const [size, setSize] = useState({ width: 640, height: 448 });
  const resizeRef = usePointerDrag({
    onStart: (event) => ({ x: event.clientX, y: event.clientY, size }),
    onMove: (event, start) =>
      setSize({
        width: clamp(
          start.size.width + start.x - event.clientX,
          480,
          window.innerWidth - 32,
        ),
        height: clamp(
          start.size.height + start.y - event.clientY,
          288,
          window.innerHeight - 32,
        ),
      }),
  });

  return (
    <RecorderPanel
      title={`Score preview · ${track.name}`}
      closeLabel={`Close score preview for ${track.name}`}
      onClose={onClose}
      data-testid="recorder-score-preview"
      className="pointer-events-auto relative flex shrink-0 flex-col overflow-hidden"
      contentClassName="min-h-0 flex-1 p-0"
      style={size}
    >
      <button
        ref={resizeRef}
        type="button"
        aria-label={`Resize score preview for ${track.name}`}
        className="absolute top-0 left-0 z-10 flex size-5 cursor-nwse-resize touch-none p-1"
      >
        <span className="pointer-events-none size-2.5 border-t-2 border-l-2 border-neutral-500" />
      </button>
      <RecorderScorePreview runtime={runtime} state={state} track={track} />
    </RecorderPanel>
  );
}

function RecorderScorePreview({
  runtime: recorder,
  state,
  track,
}: {
  runtime: RecorderRuntime;
  state: RecorderRuntimeState;
  track: MidiTrackState;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { notes, keySignature, tabOpenStringPitches } = track;
  const { title, tempo, timeSignature, locators } = state;
  const [runtime] = useState(
    () =>
      new ScoreViewerRuntime({
        clock: {
          getSnapshot: () => {
            const state = recorder.store.get();
            return { currentTime: state.position, isPlaying: state.isPlaying };
          },
          subscribe: recorder.store.subscribe,
          seek: (position) => recorder.seek(position),
          play: () => {
            recorder.play().catch((error) => toast.error(String(error)));
          },
          pause: () => recorder.pause(),
        },
        presentation: { scale: 1, viewportPadding: 12 },
      }),
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

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !isRuntimeAttached) {
      return;
    }
    const updateScale = () => {
      runtime.setScaleToFitViewport();
    };
    const observer = new ResizeObserver(updateScale);
    observer.observe(root);
    updateScale();
    return () => observer.disconnect();
  }, [isRuntimeAttached, runtime]);

  const loadMutation = useMutation({
    mutationFn: async () => {
      await runtime.load({
        score: {
          name: title,
          xml: exportMusicXml({
            notes,
            tempo,
            title,
            timeSignature,
            keySignature,
            openStringPitches: tabOpenStringPitches,
            locators: locators.map(({ id, beat, label }) => ({
              id,
              position: beat,
              label,
            })),
            trimLeadingEmptyMeasures: false,
          }),
        },
        settings: {
          ...INITIAL_SCORE_VIEWER_SETTINGS,
          showTitle: false,
          showSectionLabels: true,
        },
      });
      runtime.setScaleToFitViewport();
    },
  });

  useQuery({
    queryKey: [
      "recorder-score-preview",
      track.id,
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
      data-testid="recorder-score-renderer"
      className="score-preview-runtime h-full w-full overflow-hidden bg-neutral-300 text-neutral-950"
    />
  );
}
