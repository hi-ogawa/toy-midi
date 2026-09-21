import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLinkIcon } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
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
  type ScoreViewerClock,
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
  scoreViewerHref,
}: {
  runtime: RecorderRuntime;
  state: RecorderRuntimeState;
  track: MidiTrackState;
  onClose: () => void;
  scoreViewerHref?: string;
}) {
  const [size, setSize] = useState({ width: 640, height: 448 });
  const resizeRef = usePointerDrag({
    onStart: () => size,
    onMove: (_event, { data, deltaX, deltaY }) =>
      setSize({
        width: clamp(data.width - deltaX, 480, window.innerWidth - 32),
        height: clamp(data.height - deltaY, 288, window.innerHeight - 32),
      }),
  });

  return (
    <RecorderPanel
      title={`Score preview · ${track.name}`}
      headerActions={<RecorderScoreLink href={scoreViewerHref} />}
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

function RecorderScoreLink({ href }: { href?: string }) {
  const tooltipId = useId();
  return (
    <div className="group/score-link relative">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        role="link"
        tabIndex={0}
        aria-disabled={!href}
        aria-describedby={!href ? tooltipId : undefined}
        className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-200 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
      >
        Open score viewer
        <ExternalLinkIcon className="size-3" />
      </a>
      {!href && (
        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute top-full right-0 z-50 mt-2 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs whitespace-nowrap text-neutral-100 opacity-0 group-hover/score-link:opacity-100 group-focus-within/score-link:opacity-100"
        >
          Please save before opening score view
        </span>
      )}
    </div>
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
        clock: createRecorderScoreClock(recorder),
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
    retry: false,
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

function createRecorderScoreClock(recorder: RecorderRuntime): ScoreViewerClock {
  return {
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
  };
}
