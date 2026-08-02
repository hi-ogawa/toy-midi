import { useMutation } from "@tanstack/react-query";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { useEffect, useRef, useState } from "react";

type PlaybackState = {
  scorePosition: number;
  startedAt: number;
};

export function ScoreViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay>(undefined);
  const playbackRef = useRef<PlaybackState>(undefined);
  const frameRef = useRef<number>(undefined);
  const [fileName, setFileName] = useState<string>();
  const [isPlaying, setIsPlaying] = useState(false);

  const loadMutation = useMutation({
    mutationFn: async (file: File) => {
      const container = containerRef.current;
      if (!container) {
        throw new Error("Score viewer is not ready");
      }

      pause();
      osmdRef.current = undefined;
      container.innerHTML = "";

      const osmd = new OpenSheetMusicDisplay(container, {
        autoResize: true,
        backend: "svg",
        drawPartNames: false,
        drawTitle: false,
        followCursor: true,
        pageBackgroundColor: "#ffffff",
      });
      await osmd.load(file);
      osmd.render();
      osmd.cursor.reset();
      osmd.cursor.show();
      return { fileName: file.name, osmd };
    },
    onSuccess: ({ fileName: loadedFileName, osmd }) => {
      osmdRef.current = osmd;
      playbackRef.current = undefined;
      setFileName(loadedFileName);
    },
  });

  useEffect(() => () => cancelAnimationFrame(frameRef.current ?? 0), []);

  function togglePlayback() {
    if (isPlaying) {
      pause();
      return;
    }

    const osmd = osmdRef.current;
    if (!osmd) {
      return;
    }
    if (osmd.cursor.iterator.EndReached) {
      restart();
    }
    playbackRef.current = {
      scorePosition: osmd.cursor.iterator.CurrentEnrolledTimestamp.RealValue,
      startedAt: performance.now(),
    };
    setIsPlaying(true);
    frameRef.current = requestAnimationFrame(advancePlayback);
  }

  function pause() {
    cancelAnimationFrame(frameRef.current ?? 0);
    frameRef.current = undefined;
    playbackRef.current = undefined;
    setIsPlaying(false);
  }

  function restart() {
    pause();
    const osmd = osmdRef.current;
    if (!osmd) {
      return;
    }
    osmd.cursor.reset();
    osmd.cursor.show();
  }

  function advancePlayback(now: number) {
    const osmd = osmdRef.current;
    const playback = playbackRef.current;
    if (!osmd || !playback) {
      return;
    }

    const elapsedMinutes = (now - playback.startedAt) / 60_000;
    const targetPosition =
      playback.scorePosition + elapsedMinutes * osmd.cursor.iterator.CurrentBpm;
    while (
      !osmd.cursor.iterator.EndReached &&
      osmd.cursor.iterator.CurrentEnrolledTimestamp.RealValue <= targetPosition
    ) {
      osmd.cursor.next();
    }

    if (osmd.cursor.iterator.EndReached) {
      pause();
      return;
    }
    frameRef.current = requestAnimationFrame(advancePlayback);
  }

  return (
    <main className="h-screen overflow-hidden bg-neutral-950 text-neutral-100">
      <header className="flex h-16 items-center gap-4 border-b border-neutral-800 px-6">
        <a
          href="/"
          className="font-mono text-sm tracking-[0.2em] text-neutral-500 hover:text-neutral-200"
        >
          TOY MIDI
        </a>
        <div className="h-5 w-px bg-neutral-700" />
        <h1 className="text-sm font-medium">Score viewer spike</h1>
        <span className="min-w-0 truncate text-sm text-neutral-500">
          {fileName ?? "Load a Toy MIDI MusicXML export"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <label className="cursor-pointer rounded border border-neutral-700 px-3 py-1.5 text-sm hover:border-neutral-500 hover:bg-neutral-900">
            Open MusicXML
            <input
              type="file"
              accept=".musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml"
              disabled={loadMutation.isPending}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  loadMutation.mutate(file);
                }
              }}
            />
          </label>
          <button
            type="button"
            disabled={!loadMutation.isSuccess || loadMutation.isPending}
            onClick={restart}
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:border-neutral-500 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Restart
          </button>
          <button
            type="button"
            disabled={!loadMutation.isSuccess || loadMutation.isPending}
            onClick={togglePlayback}
            className="min-w-20 rounded bg-emerald-500 px-3 py-1.5 text-sm font-medium text-neutral-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
        </div>
      </header>

      <section className="h-[calc(100vh-4rem)] overflow-y-auto bg-neutral-300 p-8">
        {loadMutation.error && (
          <div className="mx-auto mb-4 max-w-6xl rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            {loadMutation.error.message}
          </div>
        )}
        {!fileName && !loadMutation.error && (
          <div className="mx-auto flex h-48 max-w-6xl items-center justify-center border border-dashed border-neutral-500 bg-neutral-200 text-sm text-neutral-600">
            Open a standard notation and TAB MusicXML file to begin.
          </div>
        )}
        <div
          ref={containerRef}
          data-testid="score-viewer-renderer"
          className="mx-auto min-h-full max-w-6xl bg-white px-4 shadow-xl"
        />
      </section>
    </main>
  );
}
