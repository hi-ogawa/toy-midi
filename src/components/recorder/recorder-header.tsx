import {
  ChevronDownIcon,
  CircleAlertIcon,
  CircleIcon,
  CircleStopIcon,
  DownloadIcon,
  HouseIcon,
  LoaderCircleIcon,
  LocateFixedIcon,
  Mic2Icon,
  MoreVerticalIcon,
  PauseIcon,
  PlayIcon,
  Repeat2Icon,
  SaveCheckIcon,
  SaveIcon,
  VideoIcon,
  SlidersVerticalIcon,
} from "lucide-react";
import { useDraftInput } from "../../hooks/use-draft-input";
import { useTapTempo } from "../../hooks/use-tap-tempo";
import type { RecorderRuntimeState } from "../../lib/recorder/runtime";
import { routes } from "../../lib/routes";
import { formatTimeWithMilliseconds } from "../../lib/time-format";
import {
  formatBarBeatAtTime,
  type GridDivision,
  GRID_DIVISIONS,
} from "../../lib/timeline";
import { COMMON_TIME_SIGNATURES, type TimeSignature } from "../../types";
import { MetronomeIcon } from "../icons";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../ui/utils";
import type { SaveStatus } from "./use-recorder-project";

export function RecorderHeader({
  title,
  saveStatus,
  referenceVideoOpen,
  isPlaying,
  isProcessing,
  isRecording,
  isExporting,
  metronomeEnabled,
  punch,
  position,
  tempo,
  timeSignature,
  gridDivision,
  recordDisabled,
  autoScrollEnabled,
  onPlayToggle,
  onTitleChange,
  onSave,
  onRecordToggle,
  onAutoScrollChange,
  onTempoChange,
  onMetronomeChange,
  onPunchEnabledChange,
  onTimeSignatureChange,
  onGridDivisionChange,
  onExportProject,
  onReferenceVideoOpenChange,
  onMixerToggle,
  mixerOpen,
}: {
  title: string;
  saveStatus: SaveStatus;
  referenceVideoOpen: boolean;
  isPlaying: boolean;
  isProcessing: boolean;
  isRecording: boolean;
  isExporting: boolean;
  metronomeEnabled: boolean;
  punch: RecorderRuntimeState["punch"];
  position: number;
  tempo: number;
  timeSignature: TimeSignature;
  gridDivision: GridDivision;
  recordDisabled: boolean;
  autoScrollEnabled: boolean;
  onPlayToggle: () => void;
  onTitleChange: (title: string) => void;
  onSave: () => void;
  onRecordToggle: () => void;
  onAutoScrollChange: (enabled: boolean) => void;
  onTempoChange: (tempo: number) => void;
  onMetronomeChange: (enabled: boolean) => void;
  onPunchEnabledChange: (enabled: boolean) => void;
  onTimeSignatureChange: (value: string) => void;
  onGridDivisionChange: (value: GridDivision) => void;
  onExportProject: () => void;
  onReferenceVideoOpenChange: (open: boolean) => void;
  onMixerToggle: () => void;
  mixerOpen: boolean;
}) {
  const timeSignatureValue = `${timeSignature.numerator}/${timeSignature.denominator}`;
  const { enabled: punchEnabled, range: punchRange } = punch;
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
      <Mic2Icon className="size-4 text-emerald-400" />
      <span className="mr-2 text-sm font-medium">Recorder</span>
      <div className="h-5 w-px bg-neutral-600" />
      <Button
        data-testid="recorder-play-button"
        onClick={onPlayToggle}
        disabled={isProcessing}
        aria-pressed={isPlaying}
        className={cn(
          "size-9",
          isPlaying
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        )}
        title={isRecording || isPlaying ? "Pause (Space)" : "Play (Space)"}
      >
        {isPlaying ? (
          <PauseIcon className="size-5" />
        ) : (
          <PlayIcon className="size-5" />
        )}
      </Button>
      <Button
        data-testid="recorder-record-button"
        onClick={onRecordToggle}
        disabled={recordDisabled || isProcessing}
        aria-pressed={isRecording}
        className={cn(
          "size-9",
          isRecording
            ? "bg-red-600 text-white hover:bg-red-500"
            : "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        )}
        title={isRecording ? "Stop recording (R)" : "Record (R)"}
      >
        {isRecording ? (
          <CircleStopIcon className="size-5" />
        ) : (
          <CircleIcon className="size-4 fill-current" />
        )}
      </Button>
      <div className="mx-1 h-5 w-px bg-neutral-600" />
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
      <Button
        data-testid="recorder-punch-toggle"
        onClick={() => onPunchEnabledChange(!punchEnabled)}
        aria-pressed={punchEnabled}
        title={punchRange ? "Toggle punch recording" : "Create punch range"}
        className={cn(
          "h-9 gap-1.5 px-2.5 text-xs font-medium",
          punchEnabled
            ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/25"
            : "text-neutral-300 hover:bg-neutral-700/50 hover:text-neutral-100",
        )}
      >
        <Repeat2Icon className="size-4" />
        Punch
      </Button>
      <output
        data-testid="recorder-position"
        className="font-mono text-sm tabular-nums text-neutral-300"
      >
        {formatBarBeatAtTime({ seconds: position, tempo, timeSignature })} -{" "}
        {formatTimeWithMilliseconds(position)}
      </output>
      <div className="h-5 w-px bg-neutral-600" />
      <div className="flex items-center gap-1.5 text-xs text-neutral-400">
        <span>BPM</span>
        <input
          data-testid="recorder-tempo-input"
          type="text"
          inputMode="numeric"
          {...tempoInput.props}
          className="h-8 w-14 rounded border border-neutral-600 bg-neutral-900 px-1 text-center font-mono text-sm text-neutral-100"
        />
        <Button
          data-testid="recorder-tap-tempo-button"
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
          <Button className="h-8 gap-2 border-neutral-600 bg-neutral-900 px-3 font-mono hover:bg-neutral-800">
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
            {GRID_DIVISIONS.map((value) => (
              <DropdownMenuRadioItem key={value} value={value}>
                {value}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="flex-1" />
      <RecorderSaveButton status={saveStatus} onSave={onSave} />
      <button
        type="button"
        data-testid="recorder-project-name"
        title="Rename project"
        onClick={() => {
          const nextTitle = window.prompt("Project name", title)?.trim();
          if (nextTitle && nextTitle !== title) {
            onTitleChange(nextTitle);
          }
        }}
        className="max-w-[220px] truncate text-sm text-neutral-300 hover:text-neutral-100"
      >
        {title}
      </button>
      <div className="h-5 w-px bg-neutral-600" />
      <Button
        data-testid="recorder-reference-video-button"
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
        data-testid="recorder-mixer-button"
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            title="More"
            aria-label="More"
            className="size-9 hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50"
          >
            <MoreVerticalIcon className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            data-testid="recorder-export-project"
            disabled={isRecording || isProcessing || isExporting}
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
          <DropdownMenuItem asChild>
            <a href={routes.home.href()}>
              <HouseIcon />
              Home
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={routes.recorder.href()}>
              <Mic2Icon />
              Recorder projects
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

function RecorderSaveButton({
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
        aria-label={label}
        aria-describedby="recorder-save-tooltip"
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
        id="recorder-save-tooltip"
        role="tooltip"
        className="pointer-events-none absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs font-normal whitespace-nowrap text-neutral-100 opacity-0 shadow-lg transition-opacity duration-200 group-focus-within/save:opacity-100 group-hover/save:opacity-100"
      >
        {label}
      </span>
    </div>
  );
}
