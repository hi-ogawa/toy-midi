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
  SaveCheckIcon,
  SaveIcon,
} from "lucide-react";
import { useDraftInput } from "../../hooks/use-draft-input";
import { useTapTempo } from "../../hooks/use-tap-tempo";
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
  isPlaying,
  isProcessing,
  isRecording,
  metronomeEnabled,
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
  onTimeSignatureChange,
  onGridDivisionChange,
  onExportProject,
}: {
  title: string;
  saveStatus: SaveStatus;
  isPlaying: boolean;
  isProcessing: boolean;
  isRecording: boolean;
  metronomeEnabled: boolean;
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
  onTimeSignatureChange: (value: string) => void;
  onGridDivisionChange: (value: GridDivision) => void;
  onExportProject: () => void;
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
            : "text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200",
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
            : "text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200",
        )}
      >
        <LocateFixedIcon className="size-5" />
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
            disabled={isRecording || isProcessing}
            onSelect={onExportProject}
          >
            <DownloadIcon />
            Export Project Archive
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
    <Button
      aria-label={label}
      title={label}
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
  );
}
