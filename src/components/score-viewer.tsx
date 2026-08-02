import { useMutation } from "@tanstack/react-query";
import {
  ChevronsUpDownIcon,
  FolderIcon,
  FolderOpenIcon,
  MoreVerticalIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useDraftInput } from "../hooks/use-draft-input";
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

// OSMD reads its layout width from the container's offsetWidth. This value was
// calibrated to roughly match MuseScore's apparent sheet size at its 100% view,
// which is an application-specific scale rather than a physical CSS pixel size.
// TODO: Expose this as a layout density control without coupling it to view zoom.
const SCORE_LAYOUT_WIDTH = 1110;

export function ScoreViewer() {
  const rootRef = useRef<HTMLElement>(null);

  const [bar, setBar] = useState(1);
  const [beat, setBeat] = useState(1);
  const [score, setScore] = useState<ScoreSource>();
  const [layout, setLayout] = useState<ScoreLayout>("continuous");

  // initialize runtime
  const [runtime] = useState(() => new ScoreViewerRuntime());
  const runtimeState = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
  );
  useEffect(() => {
    const root = rootRef.current;
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

  // TODO: parse time signatures from MusicXML (currently hard-coded as 4/4)
  // TODO: parse score duration or measure count to limit allowed bar/beat inputs
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
      setBar(1);
      setBeat(1);
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

  function seekTo({
    bar: nextBar,
    beat: nextBeat,
  }: {
    bar: number;
    beat: number;
  }) {
    setBar(nextBar);
    setBeat(nextBeat);
    runtime.seek(
      ((Math.max(nextBar, 1) - 1) * 4 + (Math.max(nextBeat, 1) - 1)) / 4,
    );
  }

  return (
    <main
      ref={rootRef}
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
          onClick={() => {
            runtime.restart();
            setBar(1);
            setBeat(1);
          }}
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

        <div className="h-5 w-px bg-border" />

        <div className="flex-1" />

        <span
          data-testid="score-name"
          title={score?.name}
          className="max-w-[220px] truncate text-sm text-neutral-300"
        >
          {score?.name ?? "No score loaded"}
        </span>

        <div className="h-5 w-px bg-border" />

        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Layout:</span>
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
      {loadMutation.error && (
        <p className="mx-auto mt-4 max-w-6xl text-red-800">
          {loadMutation.error.message}
        </p>
      )}
      <section
        data-testid="score-viewer-scroll"
        className="min-h-0 flex-1 overflow-y-auto p-6"
      >
        {!score && !loadMutation.error && (
          <div className="mx-auto mb-4 flex h-32 max-w-4xl items-center justify-center border border-dashed border-neutral-500 text-sm text-neutral-600">
            Open a Toy MIDI MusicXML export or load a generated sample.
          </div>
        )}
        <div
          className={cn(
            "relative mx-auto",
            layout === "continuous" ? "bg-white px-4 shadow-xl" : undefined,
          )}
          style={{ width: SCORE_LAYOUT_WIDTH }}
        >
          <div
            data-testid="score-viewer-cursor"
            className="pointer-events-none absolute top-0 left-0 z-10 w-[3px] bg-blue-500"
          />
          <div
            data-testid="score-viewer-renderer"
            style={{ width: SCORE_LAYOUT_WIDTH }}
          />
        </div>
      </section>
    </main>
  );
}
