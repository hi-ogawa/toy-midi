import {
  ChevronDownIcon,
  CircleAlertIcon,
  CircleHelpIcon,
  CircleIcon,
  CircleStopIcon,
  DownloadIcon,
  HouseIcon,
  LinkIcon,
  LoaderCircleIcon,
  LocateFixedIcon,
  MicIcon,
  MoreVerticalIcon,
  PauseIcon,
  PlayIcon,
  SaveCheckIcon,
  SaveIcon,
  VideoIcon,
  SlidersVerticalIcon,
  NotebookPenIcon,
} from "lucide-react";
import { formatGainDb } from "../lib/music";
import { PLAYBACK_RATES } from "../lib/playback-rate";
import { routes } from "../lib/routes";
import type { EditorRuntime, LoopState, PunchState } from "../lib/runtime";
import { formatTimeWithMilliseconds } from "../lib/time-format";
import {
  formatBarBeatAtTime,
  secondsToBeats,
  type GridDivision,
  GRID_DIVISIONS,
} from "../lib/timeline";
import { COMMON_TIME_SIGNATURES, type TimeSignature } from "../types";
import type { EditorFlags } from "./flags";
import { MetronomeIcon } from "./icons";
import { GainSlider } from "./mixer";
import { RangeControl } from "./range-control";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { cn } from "./ui/utils";
import { useDraftInput } from "./use-draft-input";
import { usePlaybackPosition } from "./use-playback-position";
import type { SaveStatus } from "./use-project";
import { useTapTempo } from "./use-tap-tempo";

export function Header({
  title,
  demo,
  saveStatus,
  referenceVideoOpen,
  isPlaying,
  flags,
  isExporting,
  metronomeEnabled,
  masterGain,
  loop,
  punch,
  runtime,
  playbackRate,
  tempo,
  timeSignature,
  gridDivision,
  autoScrollEnabled,
  onPlayToggle,
  onTitleChange,
  onSave,
  onRecordToggle,
  onAutoScrollChange,
  onPlaybackRateChange,
  onTempoChange,
  onMetronomeChange,
  onMasterGainChange,
  onLoopChange,
  onPunchChange,
  onTimeSignatureChange,
  onGridDivisionChange,
  onExportProject,
  onExportAudio,
  onShareLink,
  onReferenceVideoOpenChange,
  onMixerToggle,
  onProjectCommentToggle,
  onHelpOpen,
  mixerOpen,
  inputPanelOpen,
  inputAccessRequired,
  onInputPanelToggle,
}: {
  /** Undefined until the project has initialized, so the default title never shows. */
  title?: string;
  demo: boolean;
  saveStatus: SaveStatus;
  referenceVideoOpen: boolean;
  isPlaying: boolean;
  flags: EditorFlags;
  isExporting: boolean;
  metronomeEnabled: boolean;
  masterGain: number;
  loop: LoopState;
  punch: PunchState;
  runtime: EditorRuntime;
  playbackRate: number;
  tempo: number;
  timeSignature: TimeSignature;
  gridDivision: GridDivision;
  autoScrollEnabled: boolean;
  onPlayToggle: () => void;
  onTitleChange: (title: string) => void;
  onSave: () => void;
  onRecordToggle: () => void;
  onAutoScrollChange: (enabled: boolean) => void;
  onPlaybackRateChange: (playbackRate: number) => void;
  onTempoChange: (tempo: number) => void;
  onMetronomeChange: (enabled: boolean) => void;
  onMasterGainChange: (gain: number) => void;
  onLoopChange: (update: Partial<LoopState>) => void;
  onPunchChange: (update: Partial<PunchState>) => void;
  onTimeSignatureChange: (value: string) => void;
  onGridDivisionChange: (value: GridDivision) => void;
  onExportProject: () => void;
  onExportAudio: () => void;
  onShareLink: () => void;
  onReferenceVideoOpenChange: (open: boolean) => void;
  onMixerToggle: () => void;
  onProjectCommentToggle: () => void;
  onHelpOpen: () => void;
  mixerOpen: boolean;
  inputPanelOpen: boolean;
  inputAccessRequired: boolean;
  onInputPanelToggle: () => void;
}) {
  const timeSignatureValue = `${timeSignature.numerator}/${timeSignature.denominator}`;
  const tempoInput = useDraftInput({
    value: tempo,
    onCommit: onTempoChange,
    min: 30,
    max: 300,
  });
  const handleTapTempo = useTapTempo({
    min: 30,
    max: 300,
    onTempoChange,
  });
  return (
    <header className="flex h-[53px] shrink-0 items-center gap-2 border-b border-neutral-700 bg-neutral-800 px-4 shadow-sm">
      <Button
        data-testid="play-button"
        onClick={onPlayToggle}
        disabled={flags.transportDisabled}
        aria-pressed={isPlaying}
        className={cn(
          "size-9",
          isPlaying
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        )}
        title={
          flags.isRecording || isPlaying ? "Pause (Space)" : "Play (Space)"
        }
      >
        {isPlaying ? (
          <PauseIcon className="size-5" />
        ) : (
          <PlayIcon className="size-5" />
        )}
      </Button>
      <Button
        data-testid="record-button"
        onClick={onRecordToggle}
        disabled={flags.transportDisabled}
        aria-pressed={flags.isRecording}
        className={cn(
          "size-9",
          flags.isRecording
            ? "border-red-500/60 bg-red-500/20 text-red-200 hover:bg-red-500/30"
            : "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        )}
        title={flags.isRecording ? "Stop recording (R)" : "Record (R)"}
      >
        {flags.isRecording ? (
          <CircleStopIcon className="size-5" />
        ) : (
          <CircleIcon className="size-4 fill-current" />
        )}
      </Button>
      <div className="mx-1 h-5 w-px bg-neutral-600" />
      <RangeControl
        kind="loop"
        state={loop}
        runtime={runtime}
        tempo={tempo}
        timeSignature={timeSignature}
        onChange={onLoopChange}
      />
      <RangeControl
        kind="punch"
        state={punch}
        runtime={runtime}
        tempo={tempo}
        timeSignature={timeSignature}
        onChange={onPunchChange}
      />
      <Button
        onClick={() => onMetronomeChange(!metronomeEnabled)}
        aria-pressed={metronomeEnabled}
        title="Toggle metronome (M)"
        className={cn(
          "size-9",
          metronomeEnabled
            ? "bg-neutral-700 text-neutral-100 hover:bg-neutral-700"
            : "text-neutral-300 hover:bg-neutral-700/50 hover:text-neutral-100",
        )}
      >
        <MetronomeIcon className="size-5" />
      </Button>
      <Button
        onClick={() => onAutoScrollChange(!autoScrollEnabled)}
        aria-pressed={autoScrollEnabled}
        title="Toggle auto-scroll (F)"
        className={cn(
          "size-9",
          autoScrollEnabled
            ? "bg-neutral-700 text-neutral-100 hover:bg-neutral-700"
            : "text-neutral-300 hover:bg-neutral-700/50 hover:text-neutral-100",
        )}
      >
        <LocateFixedIcon className="size-5" />
      </Button>
      <PlaybackPosition
        runtime={runtime}
        tempo={tempo}
        timeSignature={timeSignature}
      />
      <div className="h-5 w-px bg-neutral-600" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="playback-rate"
            title="Playback speed (< slower / > faster)"
            disabled={flags.isRecording}
            className="h-8 gap-2 border-neutral-600 bg-neutral-900 px-3 font-mono hover:bg-neutral-800"
          >
            {playbackRate}x
            <ChevronDownIcon className="size-3 text-neutral-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup
            value={String(playbackRate)}
            onValueChange={(value) => onPlaybackRateChange(Number(value))}
          >
            {PLAYBACK_RATES.map((value) => (
              <DropdownMenuRadioItem key={value} value={String(value)}>
                {value}x
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="flex items-center gap-1.5 text-xs text-neutral-400">
        <span>BPM</span>
        <input
          data-testid="tempo-input"
          type="text"
          inputMode="numeric"
          {...tempoInput.props}
          className="h-8 w-14 rounded border border-neutral-600 bg-neutral-900 px-1 text-center font-mono text-sm text-neutral-100"
        />
        <Button
          data-testid="tap-tempo-button"
          onClick={handleTapTempo}
          title="Tap tempo"
          className="h-8 px-1.5 text-xs hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50"
        >
          TAP
        </Button>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-8 gap-2 border-neutral-600 bg-neutral-900 px-3 font-mono hover:bg-neutral-800">
            {timeSignatureValue}
            <ChevronDownIcon className="size-3 text-neutral-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup
            value={timeSignatureValue}
            onValueChange={(value) => onTimeSignatureChange(value)}
          >
            {COMMON_TIME_SIGNATURES.map(({ numerator, denominator }) => {
              const value = `${numerator}/${denominator}`;
              return (
                <DropdownMenuRadioItem key={value} value={value}>
                  {value}
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid="grid-snap-select"
            className="h-8 gap-2 border-neutral-600 bg-neutral-900 px-3 font-mono hover:bg-neutral-800"
          >
            {gridDivision}
            <ChevronDownIcon className="size-3 text-neutral-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup
            value={gridDivision}
            onValueChange={(value) =>
              onGridDivisionChange(value as GridDivision)
            }
          >
            {Object.keys(GRID_DIVISIONS).map((value) => (
              <DropdownMenuRadioItem key={value} value={value}>
                {value}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="h-5 w-px bg-neutral-600" />
      <label className="flex items-center gap-2 text-[10px] text-neutral-400">
        <span className="font-medium uppercase tracking-wide">Master</span>
        <GainSlider
          data-testid="master-gain"
          label="Master gain"
          gain={masterGain}
          onGainChange={onMasterGainChange}
          className="w-24"
        />
        <span className="w-12 text-right font-mono">
          {formatGainDb(masterGain)}
        </span>
      </label>
      <div className="flex-1" />
      {demo ? (
        <DemoControls
          status={saveStatus}
          ready={title !== undefined}
          onCopyToSave={onSave}
        />
      ) : (
        <SaveButton status={saveStatus} onSave={onSave} />
      )}
      <button
        type="button"
        data-testid="project-name"
        title="Rename project"
        disabled={title === undefined}
        onClick={() => {
          const nextTitle = window.prompt("Project name", title)?.trim();
          if (nextTitle && nextTitle !== title) {
            onTitleChange(nextTitle);
          }
        }}
        className="max-w-[220px] truncate text-sm text-neutral-300 hover:text-neutral-100"
      >
        {title ?? (
          <span
            aria-label="Loading project name"
            className="inline-block h-3 w-24 rounded bg-neutral-700 align-middle"
          />
        )}
      </button>
      <div className="h-5 w-px bg-neutral-600" />
      <Button
        data-testid="reference-video-button"
        onClick={() => onReferenceVideoOpenChange(!referenceVideoOpen)}
        aria-pressed={referenceVideoOpen}
        title="Reference video"
        className={cn(
          "size-9",
          referenceVideoOpen
            ? "bg-neutral-700 text-neutral-100 hover:bg-neutral-700"
            : "text-neutral-300 hover:bg-neutral-700/50 hover:text-neutral-100",
        )}
      >
        <VideoIcon className="size-5" />
      </Button>
      <Button
        data-testid="mixer-button"
        onClick={onMixerToggle}
        aria-pressed={mixerOpen}
        title="Mixer"
        className={cn(
          "size-9",
          mixerOpen
            ? "bg-neutral-700 text-neutral-100 hover:bg-neutral-700"
            : "text-neutral-300 hover:bg-neutral-700/50 hover:text-neutral-100",
        )}
      >
        <SlidersVerticalIcon className="size-5" />
      </Button>
      <Button
        data-testid="input-panel-button"
        onClick={onInputPanelToggle}
        aria-pressed={inputPanelOpen}
        title={
          inputAccessRequired
            ? "Audio Input (microphone access required)"
            : "Audio Input"
        }
        className={cn(
          "size-9",
          inputAccessRequired
            ? "border-orange-300/40 bg-orange-300/10 text-orange-200 hover:bg-orange-300/20"
            : inputPanelOpen
              ? "bg-neutral-700 text-neutral-100 hover:bg-neutral-700"
              : "text-neutral-300 hover:bg-neutral-700/50 hover:text-neutral-100",
        )}
      >
        <MicIcon className="size-5" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            title="Editor menu"
            aria-label="Editor menu"
            className="size-9 hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50"
          >
            <MoreVerticalIcon className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Grouped from the project outward: working in it, taking it
              out, getting help, then leaving it. */}
          <DropdownMenuItem onSelect={onProjectCommentToggle}>
            <NotebookPenIcon />
            Project Comment
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={flags.isRecording}
            onSelect={onExportAudio}
          >
            <DownloadIcon />
            Export Audio
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="export-project"
            disabled={flags.isRecording || isExporting}
            onSelect={(event) => {
              event.preventDefault();
              onExportProject();
            }}
          >
            <DownloadIcon />
            <span className="grid">
              <span className="invisible col-start-1 row-start-1">
                Export Project
              </span>
              <span className="col-start-1 row-start-1">
                {isExporting ? "Exporting..." : "Export Project"}
              </span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="copy-share-link"
            disabled={title === undefined}
            onSelect={onShareLink}
          >
            <LinkIcon />
            Copy Share Link
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onHelpOpen}>
            <CircleHelpIcon />
            Help & Shortcuts
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href={routes.home.href()}>
              <HouseIcon />
              Home
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

function PlaybackPosition({
  runtime,
  tempo,
  timeSignature,
}: {
  runtime: EditorRuntime;
  tempo: number;
  timeSignature: TimeSignature;
}) {
  const position = usePlaybackPosition(runtime);
  return (
    <output
      data-testid="position"
      data-position={position}
      data-beat={secondsToBeats(position, tempo)}
      className="font-mono text-sm tabular-nums text-neutral-300"
    >
      {formatBarBeatAtTime({ seconds: position, tempo, timeSignature })} -{" "}
      {formatTimeWithMilliseconds(position)}
    </output>
  );
}

/** A demo from a share link has no project to save, only a copy to make. */
// TODO: The copy button restates the save button's status handling with its
// own styling and labels. Decide whether it should be a plain button that
// leaves errors to the toast, or the save button with demo labels.
function DemoControls({
  status,
  ready,
  onCopyToSave,
}: {
  status: SaveStatus;
  ready: boolean;
  onCopyToSave: () => void;
}) {
  return (
    <>
      <span
        data-testid="demo-badge"
        title="Opened from a share link. Edits stay in this tab until copied."
        className="rounded border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-emerald-200 uppercase"
      >
        Demo
      </span>
      <Button
        data-testid="copy-to-save-button"
        disabled={!ready || status === "saving"}
        onClick={onCopyToSave}
        className={cn(
          "h-8 gap-1.5 border-neutral-600 bg-neutral-900 px-3 text-sm hover:bg-neutral-800",
          status === "error" && "border-red-500/60 text-red-300",
        )}
      >
        {status === "saving" ? (
          <LoaderCircleIcon className="size-3.5 animate-spin" />
        ) : (
          <SaveIcon className="size-4" />
        )}
        {status === "error" ? "Copy failed, retry" : "Copy to save"}
      </Button>
    </>
  );
}

function SaveButton({
  status,
  onSave,
}: {
  status: SaveStatus;
  onSave: () => void;
}) {
  const canSave = status === "unsaved" || status === "error";
  const label = {
    saved: "All changes saved",
    unsaved: "Unsaved changes (Ctrl/Cmd+S to save)",
    saving: "Saving project",
    error: "Save failed (click or Ctrl/Cmd+S to retry)",
  }[status];
  const icon = {
    saved: <SaveCheckIcon className="size-4" />,
    unsaved: <SaveIcon className="size-4" />,
    saving: <LoaderCircleIcon className="size-3.5 animate-spin" />,
    error: <CircleAlertIcon className="size-3.5" />,
  }[status];
  return (
    <div className="group/save relative">
      <Button
        data-testid="save-button"
        data-status={status}
        aria-label={label}
        aria-describedby="save-tooltip"
        aria-disabled={!canSave}
        onClick={canSave ? onSave : undefined}
        className={cn(
          "size-8 border-transparent bg-transparent hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
          status === "saved" && "text-neutral-500",
          status === "unsaved" && "text-neutral-300",
          status === "saving" && "text-neutral-400",
          status === "error" && "text-red-400 hover:text-red-300",
        )}
      >
        {icon}
      </Button>
      <span
        id="save-tooltip"
        role="tooltip"
        className="pointer-events-none absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs font-normal whitespace-nowrap text-neutral-100 opacity-0 shadow-lg transition-opacity duration-200 group-focus-within/save:opacity-100 group-hover/save:opacity-100"
      >
        {label}
      </span>
    </div>
  );
}
