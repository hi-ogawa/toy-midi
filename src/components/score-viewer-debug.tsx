import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { useEffect, useRef, useState } from "react";
import { exportMusicXml } from "../lib/musicxml-export";

const DEBUG_TEMPO = 60;
const DEBUG_SCORE = exportMusicXml({
  notes: Array.from({ length: 64 }, (_, index) => ({
    id: `debug-${index}`,
    pitch: [40, 43, 45, 47, 48, 47, 45, 43][index % 8],
    start: index * 0.5,
    duration: 0.5,
    velocity: 100,
  })),
  openStringPitches: [43, 38, 33, 28],
  tempo: DEBUG_TEMPO,
  timeSignature: { numerator: 4, denominator: 4 },
});

type CursorPosition = {
  time: number;
  x: number;
  top: number;
  height: number;
  systemId: number;
};

export function ScoreViewerDebug() {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const positionsRef = useRef<CursorPosition[]>([]);
  const frameRef = useRef<number>(undefined);
  const startedAtRef = useRef<number>(undefined);
  const pausedAtRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string>();
  const [tempo, setTempo] = useState(DEBUG_TEMPO);
  const [bar, setBar] = useState(1);
  const [beat, setBeat] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const osmd = new OpenSheetMusicDisplay(container, {
      backend: "svg",
      disableCursor: true,
      drawPartNames: false,
      drawTitle: false,
      pageBackgroundColor: "#ffffff",
    });
    let disposed = false;
    void osmd
      .load(DEBUG_SCORE)
      .then(() => {
        if (disposed) {
          return;
        }
        osmd.render();
        positionsRef.current = buildCursorPositions(osmd);
        updateCursor(0);
        setIsReady(true);
      })
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error ? cause.message : "Failed to load score",
        );
      });
    return () => {
      disposed = true;
      cancelAnimationFrame(frameRef.current ?? 0);
      container.innerHTML = "";
    };
  }, []);

  function togglePlayback() {
    if (isPlaying) {
      pausedAtRef.current = getCurrentScoreTime();
      cancelAnimationFrame(frameRef.current ?? 0);
      startedAtRef.current = undefined;
      setIsPlaying(false);
      return;
    }
    startedAtRef.current = performance.now();
    setIsPlaying(true);
    frameRef.current = requestAnimationFrame(advance);
  }

  function restart() {
    cancelAnimationFrame(frameRef.current ?? 0);
    startedAtRef.current = undefined;
    pausedAtRef.current = 0;
    setIsPlaying(false);
    setBar(1);
    setBeat(1);
    updateCursor(0);
  }

  function changeTempo(value: number) {
    if (!Number.isFinite(value) || value <= 0) {
      return;
    }
    const scoreTime = getCurrentScoreTime();
    pausedAtRef.current = scoreTime;
    if (isPlaying) {
      startedAtRef.current = performance.now();
    }
    setTempo(value);
  }

  function seek() {
    const quarterBeat = (Math.max(bar, 1) - 1) * 4 + (Math.max(beat, 1) - 1);
    pausedAtRef.current = quarterBeat / 4;
    if (isPlaying) {
      startedAtRef.current = performance.now();
    }
    updateCursor(pausedAtRef.current);
  }

  function getCurrentScoreTime() {
    const startedAt = startedAtRef.current;
    if (startedAt === undefined) {
      return pausedAtRef.current;
    }
    const elapsedSeconds = (performance.now() - startedAt) / 1000;
    return pausedAtRef.current + (elapsedSeconds * tempo) / 60 / 4;
  }

  function advance(now: number) {
    const startedAt = startedAtRef.current;
    if (startedAt === undefined) {
      return;
    }
    const scoreTime =
      pausedAtRef.current + ((now - startedAt) / 1000) * (tempo / 60 / 4);
    if (!updateCursor(scoreTime)) {
      pausedAtRef.current = 0;
      startedAtRef.current = undefined;
      setIsPlaying(false);
      return;
    }
    frameRef.current = requestAnimationFrame(advance);
  }

  function updateCursor(scoreTime: number) {
    const cursor = cursorRef.current;
    const positions = positionsRef.current;
    if (!cursor || positions.length < 2) {
      return false;
    }
    const last = positions.at(-1)!;
    if (scoreTime >= last.time) {
      return false;
    }
    let nextIndex = positions.findIndex(
      (position) => position.time > scoreTime,
    );
    if (nextIndex < 1) {
      nextIndex = 1;
    }
    const previous = positions[nextIndex - 1];
    const next = positions[nextIndex];
    const progress =
      next.systemId === previous.systemId
        ? (scoreTime - previous.time) / (next.time - previous.time)
        : 0;
    const x = previous.x + (next.x - previous.x) * progress;
    cursor.style.transform = `translate(${x}px, ${previous.top}px)`;
    cursor.style.height = `${previous.height}px`;
    cursor.dataset.systemId = String(previous.systemId);

    const scroller = scrollerRef.current;
    if (scroller) {
      const cursorBottom = previous.top + previous.height;
      if (
        previous.top < scroller.scrollTop ||
        cursorBottom > scroller.scrollTop + scroller.clientHeight
      ) {
        scroller.scrollTo({ top: Math.max(previous.top - 24, 0) });
      }
    }
    return true;
  }

  return (
    <main className="h-screen overflow-hidden bg-neutral-300 text-neutral-950">
      <header className="flex h-16 items-center gap-4 bg-neutral-950 px-6 text-neutral-100">
        <h1 className="font-medium">Score viewer cursor debug</h1>
        <span className="text-sm text-neutral-400">64 eighth notes, 4/4</span>
        <label className="flex items-center gap-2 text-sm text-neutral-400">
          BPM
          <input
            aria-label="BPM"
            type="number"
            min="1"
            value={tempo}
            onChange={(event) => changeTempo(event.currentTarget.valueAsNumber)}
            className="w-20 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-400">
          Bar
          <input
            aria-label="Bar"
            type="number"
            min="1"
            value={bar}
            onChange={(event) => setBar(event.currentTarget.valueAsNumber)}
            className="w-16 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-400">
          Beat
          <input
            aria-label="Beat"
            type="number"
            min="1"
            max="4"
            value={beat}
            onChange={(event) => setBeat(event.currentTarget.valueAsNumber)}
            className="w-16 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100"
          />
        </label>
        <button
          type="button"
          disabled={!isReady}
          onClick={seek}
          className="rounded border border-neutral-700 px-4 py-1.5 text-sm disabled:opacity-40"
        >
          Seek
        </button>
        <button
          type="button"
          disabled={!isReady}
          onClick={restart}
          className="rounded border border-neutral-700 px-4 py-1.5 text-sm disabled:opacity-40"
        >
          Restart
        </button>
        <button
          type="button"
          disabled={!isReady}
          onClick={togglePlayback}
          className="rounded bg-emerald-500 px-4 py-1.5 text-sm font-medium text-neutral-950 disabled:opacity-40"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
      </header>
      {error && <p className="mx-auto mt-4 max-w-6xl text-red-800">{error}</p>}
      <section
        ref={scrollerRef}
        className="h-[calc(100vh-4rem)] overflow-y-auto p-6"
      >
        <div className="relative mx-auto max-w-4xl bg-white px-4 shadow-xl">
          <div
            ref={cursorRef}
            data-testid="continuous-playback-cursor"
            className="pointer-events-none absolute top-0 left-0 z-10 w-[3px] bg-blue-500"
          />
          <div ref={containerRef} data-testid="score-viewer-debug-renderer" />
        </div>
      </section>
    </main>
  );
}

function buildCursorPositions(osmd: OpenSheetMusicDisplay): CursorPosition[] {
  const result: CursorPosition[] = [];
  for (const container of osmd.GraphicSheet
    .VerticalGraphicalStaffEntryContainers) {
    const entry = container.getFirstNonNullStaffEntry();
    const system = entry?.parentMeasure.ParentMusicSystem;
    if (!entry || !system) {
      continue;
    }
    const topStaff = system.StaffLines[0];
    const bottomStaff = system.StaffLines.at(-1)!;
    const top = topStaff.PositionAndShape.AbsolutePosition.y * 10 - 20;
    const bottom =
      (bottomStaff.PositionAndShape.AbsolutePosition.y +
        bottomStaff.StaffHeight) *
        10 +
      20;
    result.push({
      time: container.AbsoluteTimestamp.RealValue,
      x: entry.PositionAndShape.AbsolutePosition.x * 10,
      top,
      height: bottom - top,
      systemId: system.Id,
    });
  }
  return result;
}
