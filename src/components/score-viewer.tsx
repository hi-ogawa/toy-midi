import { useMutation } from "@tanstack/react-query";
import {
  ChevronsUpDownIcon,
  FolderOpenIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
} from "lucide-react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { useEffect, useRef, useState } from "react";
import { useDraftInput } from "../hooks/use-draft-input";
import { SCORE_VIEWER_SAMPLES } from "../lib/score-viewer-samples";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { cn } from "./ui/utils";

type CursorPosition = {
  time: number;
  x: number;
  top: number;
  height: number;
  systemId: number;
};

export function ScoreViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const positionsRef = useRef<CursorPosition[]>([]);
  const frameRef = useRef<number>(undefined);
  const startedAtRef = useRef<number>(undefined);
  const pausedAtRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [tempo, setTempo] = useState(SCORE_VIEWER_SAMPLES[0].tempo);
  const [bar, setBar] = useState(1);
  const [beat, setBeat] = useState(1);
  const [scoreName, setScoreName] = useState<string>();
  const [scoreXml, setScoreXml] = useState<string>();
  const [scoreWidth, setScoreWidth] = useState(1110);
  const tempoInput = useDraftInput({
    value: tempo,
    onCommit: changeTempo,
    min: 1,
  });
  const barInput = useDraftInput({
    value: bar,
    onCommit: (value) => seekTo({ bar: value, beat }),
    min: 1,
  });
  const beatInput = useDraftInput({
    value: beat,
    onCommit: (value) => seekTo({ bar, beat: value }),
    min: 1,
    max: 4,
  });
  const scoreWidthInput = useDraftInput({
    value: scoreWidth,
    onCommit: changeScoreWidth,
    min: 600,
    max: 1600,
    step: 10,
  });

  const loadMutation = useMutation({
    mutationFn: async ({ name, xml }: { name: string; xml: string }) => {
      const container = containerRef.current;
      if (!container) {
        throw new Error("Score viewer is not ready");
      }
      cancelAnimationFrame(frameRef.current ?? 0);
      startedAtRef.current = undefined;
      pausedAtRef.current = 0;
      setIsPlaying(false);
      setIsReady(false);
      container.innerHTML = "";

      const osmd = new OpenSheetMusicDisplay(container, {
        autoBeam: true,
        autoGenerateMultipleRestMeasuresFromRestMeasures: false,
        backend: "svg",
        disableCursor: true,
        drawMeasureNumbersOnlyAtSystemStart: true,
        drawPartNames: false,
        drawTitle: false,
        pageBackgroundColor: "#ffffff",
      });
      await osmd.load(xml);
      osmd.render();
      return {
        name,
        positions: buildCursorPositions(osmd),
        tempo: parseTempo(xml),
        xml,
      };
    },
    onSuccess: ({ name, positions, tempo: importedTempo, xml }) => {
      positionsRef.current = positions;
      setScoreName(name);
      setScoreXml(xml);
      setTempo(importedTempo);
      setBar(1);
      setBeat(1);
      setIsReady(true);
      updateCursor(0);
    },
  });

  useEffect(() => () => cancelAnimationFrame(frameRef.current ?? 0), []);

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
    scrollerRef.current?.scrollTo({ top: 0 });
  }

  function changeTempo(value: number) {
    if (!Number.isFinite(value) || value <= 0) {
      return;
    }
    pausedAtRef.current = getCurrentScoreTime();
    if (isPlaying) {
      startedAtRef.current = performance.now();
    }
    setTempo(value);
  }

  function changeScoreWidth(value: number) {
    if (value === scoreWidth) {
      return;
    }
    setScoreWidth(value);
    if (scoreName && scoreXml) {
      loadMutation.mutate({ name: scoreName, xml: scoreXml });
    }
  }

  function seekTo({
    bar: nextBar,
    beat: nextBeat,
  }: {
    bar: number;
    beat: number;
  }) {
    setBar(nextBar);
    setBeat(nextBeat);
    pausedAtRef.current =
      ((Math.max(nextBar, 1) - 1) * 4 + (Math.max(nextBeat, 1) - 1)) / 4;
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
    return (
      pausedAtRef.current +
      ((performance.now() - startedAt) / 1000) * (tempo / 60 / 4)
    );
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
    cursor.style.transform = `translate(${previous.x + (next.x - previous.x) * progress}px, ${previous.top}px)`;
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
      <header className="flex items-center gap-2 border-b border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-100">
        <Button
          data-testid="score-play-pause-button"
          disabled={!isReady}
          onClick={togglePlayback}
          title={isPlaying ? "Pause" : "Play"}
          className={cn(
            "size-9",
            isPlaying
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
          )}
        >
          {isPlaying ? (
            <PauseIcon className="size-5" />
          ) : (
            <PlayIcon className="size-5" />
          )}
        </Button>
        <Button
          disabled={!isReady}
          onClick={restart}
          title="Restart"
          aria-label="Restart"
          className="size-9 hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50"
        >
          <RotateCcwIcon className="size-5" />
        </Button>

        <div className="h-5 w-px bg-border" />

        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Bar:</span>
          <input
            aria-label="Bar"
            type="text"
            inputMode="numeric"
            {...barInput.props}
            className="h-8 w-12 rounded border border-border bg-input px-1 text-center font-mono text-sm text-foreground"
          />
          <span className="text-muted-foreground">Beat:</span>
          <input
            aria-label="Beat"
            type="text"
            inputMode="numeric"
            {...beatInput.props}
            className="h-8 w-12 rounded border border-border bg-input px-1 text-center font-mono text-sm text-foreground"
          />
        </div>

        <div className="h-5 w-px bg-border" />

        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">BPM:</span>
          <input
            aria-label="BPM"
            type="text"
            inputMode="numeric"
            {...tempoInput.props}
            className="h-8 w-14 rounded border border-border bg-input px-1 text-center font-mono text-sm text-foreground"
          />
        </label>

        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Score width:</span>
          <input
            aria-label="Score width"
            type="text"
            inputMode="numeric"
            {...scoreWidthInput.props}
            className="h-8 w-16 rounded border border-border bg-input px-1 text-center font-mono text-sm text-foreground"
          />
        </label>

        <div className="h-5 w-px bg-border" />

        <span
          data-testid="score-name"
          title={scoreName}
          className="max-w-[220px] truncate text-sm text-neutral-300"
        >
          {scoreName ?? "No score loaded"}
        </span>

        <div className="flex-1" />

        <Button
          disabled={loadMutation.isPending}
          onClick={() => fileInputRef.current?.click()}
          className="h-8 gap-1.5 px-3 hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50"
        >
          <FolderOpenIcon className="size-4" />
          Open
        </Button>
        <input
          ref={fileInputRef}
          aria-label="Open MusicXML"
          type="file"
          accept=".musicxml,.xml,application/vnd.recordare.musicxml+xml"
          disabled={loadMutation.isPending}
          className="hidden"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) {
              void file.text().then((xml) =>
                loadMutation.mutate({
                  name: file.name,
                  xml,
                }),
              );
            }
          }}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="h-8 gap-1.5 px-3 hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50">
              Samples
              <ChevronsUpDownIcon className="size-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            {SCORE_VIEWER_SAMPLES.map((sample) => (
              <DropdownMenuItem
                key={sample.id}
                onSelect={() =>
                  loadMutation.mutate({
                    name: sample.name,
                    xml: sample.xml,
                  })
                }
                className="items-start"
              >
                <div>
                  <div>{sample.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {sample.description}
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      {loadMutation.error && (
        <p className="mx-auto mt-4 max-w-6xl text-red-800">
          {loadMutation.error.message}
        </p>
      )}
      <section
        ref={scrollerRef}
        className="h-[calc(100vh-4rem)] overflow-y-auto p-6"
      >
        {!scoreName && !loadMutation.error && (
          <div className="mx-auto mb-4 flex h-32 max-w-4xl items-center justify-center border border-dashed border-neutral-500 text-sm text-neutral-600">
            Open a Toy MIDI MusicXML export or load a generated sample.
          </div>
        )}
        <div
          className="relative mx-auto bg-white px-4 shadow-xl"
          style={{ width: scoreWidth }}
        >
          <div
            ref={cursorRef}
            data-testid="continuous-playback-cursor"
            className="pointer-events-none absolute top-0 left-0 z-10 w-[3px] bg-blue-500"
          />
          <div ref={containerRef} data-testid="score-viewer-renderer" />
        </div>
      </section>
    </main>
  );
}

function parseTempo(xml: string) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const value = Number(
    document.querySelector("sound[tempo]")?.getAttribute("tempo") ??
      document.querySelector("metronome per-minute")?.textContent,
  );
  return Number.isFinite(value) && value > 0 ? value : 120;
}

function buildCursorPositions(osmd: OpenSheetMusicDisplay): CursorPosition[] {
  const result: CursorPosition[] = [];
  const systems = osmd.GraphicSheet.MusicPages.flatMap(
    (page) => page.MusicSystems,
  );
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
  for (const system of systems) {
    const previous = result.findLast(
      (position) => position.systemId === system.Id,
    );
    if (previous) {
      result.push({
        ...previous,
        time: system.GetSystemsLastTimeStamp().RealValue,
        x: system.GetRightBorderAbsoluteXPosition() * 10,
      });
    }
  }
  return result.sort((a, b) => a.time - b.time || a.systemId - b.systemId);
}
