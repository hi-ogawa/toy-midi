import { useMutation } from "@tanstack/react-query";
import {
  ChevronsUpDownIcon,
  FolderIcon,
  FolderOpenIcon,
  LocateFixedIcon,
  MoreVerticalIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  UploadIcon,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useDraftInput } from "../hooks/use-draft-input";
import { useWindowEvent } from "../hooks/use-window-event";
import { isShortcutTextInputTarget, matchKeyboardEvent } from "../lib/keyboard";
import { SCORE_VIEWER_SAMPLES } from "../lib/score-viewer-samples";
import { FileDropInput } from "./file-drop-input";
import {
  type ScoreLayout,
  type ScoreSource,
  ScoreViewerRuntime,
} from "./score-viewer-runtime";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { cn } from "./ui/utils";

export function ScoreViewer() {
  const runtimeRootRef = useRef<HTMLDivElement>(null);

  const [score, setScore] = useState<ScoreSource>();
  const [layout, setLayout] = useState<ScoreLayout>("continuous");

  // initialize runtime
  const [runtime] = useState(() => new ScoreViewerRuntime());
  const runtimeState = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
  );
  useEffect(() => {
    const root = runtimeRootRef.current;
    if (!root) {
      return;
    }
    runtime.attach(root);
    return () => runtime.dispose();
  }, [runtime]);

  const tempoInput = useDraftInput({
    value: runtimeState.tempo,
    onCommit: (tempo) => runtime.setTempo(tempo),
    min: 1,
  });

  useWindowEvent("keydown", (event) => {
    if (isShortcutTextInputTarget(event.target)) {
      return;
    }
    if (matchKeyboardEvent(event, "Space") && !event.repeat) {
      event.preventDefault();
      runtime.togglePlayback();
    }
  });

  const loadMutation = useMutation({
    mutationFn: async ({
      layout,
      source,
    }: {
      layout: ScoreLayout;
      source: File | ScoreSource;
    }) => {
      const nextScore =
        source instanceof File
          ? { name: source.name, xml: await source.text() }
          : source;
      await runtime.load({ score: nextScore, layout });
      setScore(nextScore);
    },
  });

  function changeLayout(nextLayout: ScoreLayout) {
    if (nextLayout === layout) {
      return;
    }
    setLayout(nextLayout);
    if (score) {
      loadMutation.mutate({
        layout: nextLayout,
        source: score,
      });
    }
  }

  // TODO: Parse time signatures and score bounds for meter-aware seeking.
  function promptForPosition() {
    const value = window.prompt(
      "Go to bar and beat",
      formatBarBeat(runtimeState.bar, runtimeState.beat),
    );
    const match = value?.match(/^(\d+)[|:](\d+)$/);
    if (!match) {
      return;
    }
    const bar = Math.max(Number(match[1]), 1);
    const beat = Math.min(Math.max(Number(match[2]), 1), 4);
    runtime.seek(((bar - 1) * 4 + (beat - 1)) / 4);
  }

  return (
    <main
      className={cn(
        "flex h-screen flex-col overflow-hidden bg-neutral-300 text-neutral-950",
        layout === "paged" && "score-viewer-root-paged",
      )}
    >
      <header className="flex items-center gap-2 border-b border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-100">
        <Button
          data-testid="score-play-pause-button"
          disabled={!runtimeState.isReady}
          onClick={() => runtime.togglePlayback()}
          title={runtimeState.isPlaying ? "Pause" : "Play"}
          className={cn(
            "size-9",
            runtimeState.isPlaying
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
          )}
        >
          {runtimeState.isPlaying ? (
            <PauseIcon className="size-5" />
          ) : (
            <PlayIcon className="size-5" />
          )}
        </Button>
        <Button
          disabled={!runtimeState.isReady}
          onClick={() => runtime.restart()}
          title="Restart"
          aria-label="Restart"
          className="size-9 hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50"
        >
          <RotateCcwIcon className="size-5" />
        </Button>

        <div className="h-5 w-px bg-border" />

        <div className="flex items-center gap-1">
          <span className="whitespace-nowrap font-mono text-sm text-neutral-300">
            {formatBarBeat(runtimeState.bar, runtimeState.beat)}
          </span>
          <Button
            aria-label="Seek"
            title="Seek"
            disabled={!runtimeState.isReady}
            onClick={promptForPosition}
            className="size-7 px-0 text-neutral-400 hover:bg-accent hover:text-white"
          >
            <LocateFixedIcon className="size-3.5" />
          </Button>
        </div>

        <div className="h-5 w-px bg-border" />

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">BPM</span>
            <input
              aria-label="BPM"
              type="text"
              inputMode="numeric"
              {...tempoInput.props}
              className="h-8 w-14 rounded border border-border bg-input px-1 text-center font-mono text-sm text-foreground"
            />
          </label>

          <label className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Layout</span>
            <select
              aria-label="Layout"
              value={layout}
              onChange={(event) =>
                changeLayout(event.currentTarget.value as ScoreLayout)
              }
              className="h-8 rounded border border-border bg-input px-2 text-sm text-foreground"
            >
              <option value="continuous">Continuous</option>
              <option value="paged">Paged</option>
            </select>
          </label>
        </div>

        <div className="flex-1" />

        <span
          data-testid="score-name"
          title={score?.name}
          className="max-w-[220px] truncate text-sm text-neutral-300"
        >
          {score?.name ?? "No score loaded"}
        </span>

        <div className="h-5 w-px bg-border" />

        <FileDropInput
          accept=".musicxml,.xml,application/vnd.recordare.musicxml+xml"
          disabled={loadMutation.isPending}
          inputProps={{ "aria-label": "Open MusicXML" }}
          onFile={(file) => loadMutation.mutate({ layout, source: file })}
          className="h-8 gap-1.5 px-3 hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50"
        >
          <FolderOpenIcon className="size-4" />
          Open
        </FileDropInput>
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
                    layout,
                    source: { name: sample.name, xml: sample.xml },
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              title="More"
              aria-label="More"
              className="size-8 hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50"
            >
              <MoreVerticalIcon className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href="/" data-testid="all-projects-menu-item">
                <FolderIcon />
                All Projects
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      {!score && !loadMutation.error && (
        <section className="min-h-0 flex-1 p-6">
          <div className="flex justify-center">
            <FileDropInput
              accept=".musicxml,.xml,application/vnd.recordare.musicxml+xml"
              disabled={loadMutation.isPending}
              inputProps={{ "aria-label": "Upload MusicXML" }}
              onFile={(file) => loadMutation.mutate({ layout, source: file })}
              className="group h-48 w-full max-w-4xl flex-col gap-3 rounded-sm border border-dashed border-neutral-500 bg-neutral-200/60 text-center text-neutral-700 shadow-none hover:border-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 data-[drag-over=true]:border-blue-600 data-[drag-over=true]:bg-blue-50 data-[drag-over=true]:text-blue-900"
            >
              <span className="flex size-11 items-center justify-center rounded-full border border-neutral-400 bg-white shadow-sm group-data-[drag-over=true]:border-blue-400">
                <UploadIcon className="size-5" />
              </span>
              <span className="font-medium">Drop a MusicXML score here</span>
              <span className="text-xs text-neutral-500 group-data-[drag-over=true]:text-blue-700">
                or click to choose an .xml or .musicxml file
              </span>
            </FileDropInput>
          </div>
        </section>
      )}
      {loadMutation.error && (
        <p className="mx-auto mt-4 max-w-6xl text-red-800">
          {loadMutation.error.message}
        </p>
      )}
      <div
        ref={runtimeRootRef}
        data-testid="score-viewer-runtime-root"
        className="min-h-0 flex-1"
      />
    </main>
  );
}

function formatBarBeat(bar: number, beat: number) {
  return `${String(bar).padStart(2, "0")}|${String(beat).padStart(2, "0")}`;
}
