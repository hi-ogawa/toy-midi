import { CursorType, OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { useEffect, useRef, useState } from "react";
import { exportMusicXml } from "../lib/musicxml-export";

const DEBUG_SCORE = exportMusicXml({
  notes: Array.from({ length: 32 }, (_, index) => ({
    id: `debug-${index}`,
    pitch: [40, 43, 45, 47, 48, 47, 45, 43][index % 8],
    start: index,
    duration: 1,
    velocity: 100,
  })),
  openStringPitches: [43, 38, 33, 28],
  tempo: 60,
  timeSignature: { numerator: 4, denominator: 4 },
});

export function ScoreViewerDebug() {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay>(undefined);
  const frameRef = useRef<number>(undefined);
  const startedAtRef = useRef<number>(undefined);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const osmd = new OpenSheetMusicDisplay(container, {
      backend: "svg",
      drawPartNames: false,
      drawTitle: false,
      followCursor: true,
      pageBackgroundColor: "#ffffff",
      cursorsOptions: [
        {
          alpha: 0.65,
          color: "#ff0000",
          follow: true,
          type: CursorType.Standard,
        },
      ],
    });
    let disposed = false;
    void osmd
      .load(DEBUG_SCORE)
      .then(() => {
        if (disposed) {
          return;
        }
        osmd.render();
        osmd.cursor.show();
        makeCursorVisible(osmd);
        osmdRef.current = osmd;
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
      osmd.cursors.forEach((cursor) => cursor.Dispose());
      container.innerHTML = "";
    };
  }, []);

  function togglePlayback() {
    if (isPlaying) {
      cancelAnimationFrame(frameRef.current ?? 0);
      startedAtRef.current = undefined;
      setIsPlaying(false);
      return;
    }
    if (!osmdRef.current) {
      return;
    }
    startedAtRef.current = performance.now();
    setIsPlaying(true);
    frameRef.current = requestAnimationFrame(advance);
  }

  function advance(now: number) {
    const osmd = osmdRef.current;
    const startedAt = startedAtRef.current;
    if (!osmd || startedAt === undefined) {
      return;
    }
    const targetQuarter = Math.floor((now - startedAt) / 1000);
    const currentQuarter =
      osmd.cursor.iterator.CurrentEnrolledTimestamp.RealValue * 4;
    if (currentQuarter <= targetQuarter && !osmd.cursor.iterator.EndReached) {
      osmd.cursor.next();
      makeCursorVisible(osmd);
    }
    if (osmd.cursor.iterator.EndReached) {
      setIsPlaying(false);
      return;
    }
    frameRef.current = requestAnimationFrame(advance);
  }

  return (
    <main className="min-h-screen bg-neutral-300 p-6 text-neutral-950">
      <header className="mx-auto mb-4 flex max-w-6xl items-center gap-4 rounded bg-neutral-950 px-5 py-3 text-neutral-100">
        <h1 className="font-medium">Score viewer cursor debug</h1>
        <span className="text-sm text-neutral-400">
          32 quarter notes, 4/4, 60 BPM
        </span>
        <button
          type="button"
          disabled={!isReady}
          onClick={togglePlayback}
          className="ml-auto rounded bg-emerald-500 px-4 py-1.5 text-sm font-medium text-neutral-950 disabled:opacity-40"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
      </header>
      {error && <p className="mx-auto mb-4 max-w-6xl text-red-800">{error}</p>}
      <div
        ref={containerRef}
        data-testid="score-viewer-debug-renderer"
        className="mx-auto max-w-6xl bg-white px-4 shadow-xl"
      />
    </main>
  );
}

function makeCursorVisible(osmd: OpenSheetMusicDisplay) {
  const cursor = osmd.cursor.cursorElement;
  cursor.src =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="100"><rect width="8" height="100" rx="2" fill="#ef4444"/></svg>',
    );
  cursor.style.width = "8px";
  cursor.style.objectFit = "fill";
}
