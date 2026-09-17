import { useEffect, useMemo, useRef, useState } from "react";
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

  // Score inputs exclude transport position and mix state, so playback never re-engraves notes.
  const source = useMemo(() => {
    if (track.notes.length === 0) {
      return { empty: true };
    }
    try {
      return {
        xml: exportMusicXml({
          notes: track.notes,
          openStringPitches: track.tabOpenStringPitches,
          keySignature: track.keySignature,
          title: state.title,
          tempo: state.tempo,
          timeSignature: state.timeSignature,
          locators: state.locators.map(({ id, beat, label }) => ({
            id,
            position: beat,
            label,
          })),
          trimLeadingEmptyMeasures: false,
        }),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [
    track.notes,
    track.tabOpenStringPitches,
    track.keySignature,
    state.title,
    state.tempo,
    state.timeSignature,
    state.locators,
  ]);

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
      {source.empty ? (
        <p className="p-6 text-sm text-neutral-400">
          Add a note to preview the score.
        </p>
      ) : source.error ? (
        <p role="alert" className="p-6 text-sm text-red-300">
          {source.error}
        </p>
      ) : (
        source.xml !== undefined && (
          <RecorderScoreRenderer runtime={runtime} xml={source.xml} />
        )
      )}
    </RecorderPanel>
  );
}

function RecorderScoreRenderer({
  runtime,
  xml,
}: {
  runtime: RecorderRuntime;
  xml: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ScoreViewerRuntime>(undefined);
  const pendingLoad = useRef(Promise.resolve());
  const [status, setStatus] = useState<{ loading: boolean; error?: string }>({
    loading: true,
  });

  // The viewer uses the shared recorder clock and owns only its rendering resources.
  useEffect(() => {
    const root = rootRef.current!;
    const viewer = new ScoreViewerRuntime({
      clock: {
        getSnapshot: () => {
          const state = runtime.store.get();
          return { currentTime: state.position, isPlaying: state.isPlaying };
        },
        subscribe: runtime.store.subscribe,
        seek: (position) => runtime.seek(position),
        play: () => {
          runtime.play().catch((error) => toast.error(String(error)));
        },
        pause: () => runtime.pause(),
      },
      presentation: { scale: 1, viewportPadding: 12 },
    });
    viewer.attach(root);
    viewerRef.current = viewer;
    const observer = new ResizeObserver(() => viewer.setScaleToFitViewport());
    observer.observe(root);
    return () => {
      observer.disconnect();
      viewerRef.current = undefined;
      viewer.dispose();
    };
  }, [runtime]);

  // Serialize OSMD loads and skip obsolete queued edits before touching the renderer.
  useEffect(() => {
    const viewer = viewerRef.current!;
    let cancelled = false;
    setStatus({ loading: true });
    pendingLoad.current = pendingLoad.current.then(async () => {
      if (cancelled) {
        return;
      }
      try {
        await viewer.load({
          score: { name: "Score preview", xml },
          settings: {
            ...INITIAL_SCORE_VIEWER_SETTINGS,
            showTitle: false,
            showSectionLabels: true,
          },
        });
        if (!cancelled) {
          viewer.setScaleToFitViewport();
          setStatus({ loading: false });
        }
      } catch (error) {
        if (!cancelled) {
          setStatus({
            loading: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [runtime, xml]);

  return (
    <div className="relative h-full">
      <div
        ref={rootRef}
        data-testid="recorder-score-renderer"
        className="h-full w-full overflow-hidden bg-neutral-300 text-neutral-950"
      />
      {(status.loading || status.error) && (
        <p
          role={status.error ? "alert" : "status"}
          className="absolute inset-0 bg-neutral-800 p-6 text-sm text-neutral-300"
        >
          {status.error ?? "Loading score…"}
        </p>
      )}
    </div>
  );
}
