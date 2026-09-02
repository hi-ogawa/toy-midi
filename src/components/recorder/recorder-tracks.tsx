import {
  ChevronDownIcon,
  ChevronRightIcon,
  DownloadIcon,
  HeadphonesIcon,
  MoreVerticalIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { usePointerDrag } from "../../hooks/use-pointer-drag";
import type { AudioAnalyser } from "../../lib/audio-analyser";
import {
  dbToPercent,
  formatGainDb,
  gainToPercent,
  percentToGain,
} from "../../lib/music";
import { openFilePicker } from "../file-drop-input";
import { InputMeter } from "../input-meter";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../ui/utils";
import { RecorderMixToggle } from "./recorder-mix-toggle";

export function AudioTrackActions({
  label,
  onFileChange,
  onRemove,
}: {
  label: string;
  onFileChange: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="size-7 border-neutral-600 text-neutral-300 hover:bg-neutral-700"
          title={`${label} actions`}
        >
          <MoreVerticalIcon className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() =>
            openFilePicker({ accept: "audio/*,.wav", onFile: onFileChange })
          }
        >
          <UploadIcon />
          Replace audio
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onRemove} className="text-red-400">
          <Trash2Icon />
          Remove track
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TrackRow({
  title,
  subtitle,
  height,
  gain,
  muted,
  soloed,
  action,
  onGainChange,
  onMutedChange,
  onSoloedChange,
  onHeightChange,
  children,
}: {
  title: string;
  subtitle: string;
  height: number;
  gain: number;
  muted: boolean;
  soloed: boolean;
  action: React.ReactNode;
  onGainChange: (gain: number) => void;
  onMutedChange: (muted: boolean) => void;
  onSoloedChange: (soloed: boolean) => void;
  onHeightChange: (height: number) => void;
  children: React.ReactNode;
}) {
  const resizeRef = usePointerDrag({
    onStart: (event) => {
      event.preventDefault();
      return { startClientY: event.clientY, startHeight: height };
    },
    onMove: (event, drag) => {
      onHeightChange(drag.startHeight + event.clientY - drag.startClientY);
    },
  });
  return (
    <div
      className="relative grid grid-cols-[15rem_1fr] border-b border-neutral-700"
      style={{ height }}
    >
      <div className="sticky left-0 z-20 grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-r border-neutral-700 bg-neutral-800 p-3">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold">{title}</div>
          <div className="mt-0.5 truncate text-[11px] text-neutral-400">
            {subtitle}
          </div>
        </div>
        <div className="flex gap-1">
          {action}
          <RecorderMixToggle
            active={muted}
            kind="mute"
            onClick={() => onMutedChange(!muted)}
            className="size-7"
            title={muted ? `Unmute ${title}` : `Mute ${title}`}
          />
          <RecorderMixToggle
            active={soloed}
            kind="solo"
            onClick={() => onSoloedChange(!soloed)}
            className="size-7"
            title={soloed ? `Disable ${title} solo` : `Solo ${title}`}
          />
        </div>
        <label className="col-span-2 mt-auto grid grid-cols-[1fr_3.5rem] items-center gap-2 text-[10px] text-neutral-400">
          <div className="relative">
            <div
              className="pointer-events-none absolute top-1/2 h-3 w-px -translate-y-1/2 bg-neutral-500/70"
              style={{ left: `${dbToPercent(0)}%` }}
            />
            <input
              aria-label={`${title} gain`}
              type="range"
              min={0}
              max={100}
              step={1}
              value={gainToPercent(gain)}
              onChange={(event) =>
                onGainChange(percentToGain(event.currentTarget.valueAsNumber))
              }
              className="w-full accent-emerald-600"
            />
          </div>
          <span className="text-right font-mono">{formatGainDb(gain)}</span>
        </label>
      </div>
      {children}
      <div
        ref={resizeRef}
        className="absolute inset-x-0 -bottom-1 z-30 h-2 cursor-ns-resize"
        title={`Resize ${title}`}
      />
    </div>
  );
}

export function CaptureTrackRow({
  route,
  routeNeedsSetup,
  subtitle,
  height,
  gain,
  inputActive,
  inputAnalyser,
  inputListening,
  inputToggleDisabled,
  muted,
  soloed,
  takeDownloadDisabled,
  onGainChange,
  onInputSetup,
  onInputListeningChange,
  onInputToggle,
  onMutedChange,
  onSoloedChange,
  onTakeDownload,
  onHeightChange,
  children,
}: {
  route: string;
  routeNeedsSetup: boolean;
  subtitle: string;
  height: number;
  gain: number;
  inputActive: boolean;
  inputAnalyser?: AudioAnalyser;
  inputListening: boolean;
  inputToggleDisabled: boolean;
  muted: boolean;
  soloed: boolean;
  takeDownloadDisabled: boolean;
  onGainChange: (gain: number) => void;
  onInputSetup: () => void;
  onInputListeningChange: (listening: boolean) => void;
  onInputToggle: () => void;
  onMutedChange: (muted: boolean) => void;
  onSoloedChange: (soloed: boolean) => void;
  onTakeDownload: () => void;
  onHeightChange: (height: number) => void;
  children: React.ReactNode;
}) {
  const resizeRef = usePointerDrag({
    onStart: (event) => {
      event.preventDefault();
      return { startClientY: event.clientY, startHeight: height };
    },
    onMove: (event, drag) => {
      onHeightChange(drag.startHeight + event.clientY - drag.startClientY);
    },
  });
  return (
    <div className="relative grid grid-cols-[15rem_1fr]" style={{ height }}>
      <div className="sticky left-0 z-20 grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[2rem_1rem_0.75rem_1fr] gap-x-2 gap-y-1 border-r border-neutral-700 bg-neutral-800 p-3">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold">Capture</div>
          <div className="mt-0.5 truncate text-[11px] text-neutral-400">
            {subtitle}
          </div>
        </div>
        <div className="flex gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="size-7 border-neutral-600 text-neutral-300 hover:bg-neutral-700"
                title="Capture actions"
                aria-label="Capture actions"
              >
                <MoreVerticalIcon className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                data-testid="recorder-download-take"
                disabled={takeDownloadDisabled}
                onSelect={onTakeDownload}
              >
                <DownloadIcon />
                Download recording
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            data-testid="recorder-input-toggle"
            disabled={inputToggleDisabled}
            onClick={onInputToggle}
            className={
              inputActive
                ? "size-7 border-red-500/60 bg-red-500/25 text-red-300 hover:bg-red-500/35"
                : "size-7 border-neutral-600 text-neutral-300 hover:bg-neutral-700"
            }
            title={inputActive ? "Disarm capture" : "Arm capture"}
            aria-label={inputActive ? "Disarm capture" : "Arm capture"}
            aria-pressed={inputActive}
          >
            R
          </Button>
          <RecorderMixToggle
            active={muted}
            kind="mute"
            onClick={() => onMutedChange(!muted)}
            className="size-7"
            title={muted ? "Unmute Capture" : "Mute Capture"}
          />
          <RecorderMixToggle
            active={soloed}
            kind="solo"
            onClick={() => onSoloedChange(!soloed)}
            className="size-7"
            title={soloed ? "Disable Capture solo" : "Solo Capture"}
          />
        </div>
        <div className="col-span-2 flex min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={onInputSetup}
            className={cn(
              "min-w-0 flex-1 truncate text-left text-[11px] hover:underline",
              routeNeedsSetup
                ? "font-medium text-orange-300 hover:text-orange-200"
                : "text-neutral-400 hover:text-neutral-100",
            )}
          >
            {route}
          </button>
          <button
            type="button"
            data-testid="recorder-input-listen"
            disabled={!inputActive}
            aria-label={inputListening ? "Stop listening" : "Listen to input"}
            aria-pressed={inputListening}
            title={
              inputActive
                ? inputListening
                  ? "Stop listening"
                  : "Listen to input (use headphones to avoid feedback)"
                : "Enable input first to listen"
            }
            onClick={() => onInputListeningChange(!inputListening)}
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200 disabled:pointer-events-none disabled:opacity-30",
              inputListening &&
                "bg-sky-500/25 text-sky-300 hover:bg-sky-500/35",
            )}
          >
            <HeadphonesIcon className="size-3.5" />
          </button>
        </div>
        <div className="col-span-2">
          <InputMeter active={inputActive} analyser={inputAnalyser} compact />
        </div>
        <label className="col-span-2 grid grid-cols-[1fr_3.5rem] items-end gap-2 text-[10px] text-neutral-400">
          <div className="relative">
            <div
              className="pointer-events-none absolute top-1/2 h-3 w-px -translate-y-1/2 bg-neutral-500/70"
              style={{ left: `${dbToPercent(0)}%` }}
            />
            <input
              aria-label="Capture gain"
              type="range"
              min={0}
              max={100}
              step={1}
              value={gainToPercent(gain)}
              onChange={(event) =>
                onGainChange(percentToGain(event.currentTarget.valueAsNumber))
              }
              className="w-full accent-emerald-600"
            />
          </div>
          <span className="text-right font-mono">{formatGainDb(gain)}</span>
        </label>
      </div>
      {children}
      <div
        ref={resizeRef}
        className="absolute inset-x-0 bottom-0 z-30 h-px cursor-ns-resize border-b border-neutral-700 after:absolute after:inset-x-0 after:-top-1 after:h-2"
        title="Resize Capture"
      />
    </div>
  );
}

export function TakesDisclosureRow({
  expanded,
  takeCount,
  onExpandedChange,
}: {
  expanded: boolean;
  takeCount: number;
  onExpandedChange: (expanded: boolean) => void;
}) {
  return (
    <div className="grid h-9 grid-cols-[15rem_1fr] border-b border-neutral-700 bg-neutral-900">
      <button
        type="button"
        data-testid="recorder-takes-toggle"
        aria-expanded={expanded}
        onClick={() => onExpandedChange(!expanded)}
        className="sticky left-0 z-20 flex items-center gap-2 border-r border-neutral-700 bg-neutral-900 px-3 text-xs font-semibold text-neutral-300 hover:bg-neutral-800"
      >
        {expanded ? (
          <ChevronDownIcon className="size-3.5 text-neutral-400" />
        ) : (
          <ChevronRightIcon className="size-3.5 text-neutral-400" />
        )}
        Takes
        <span className="text-[10px] font-normal text-neutral-500">
          {takeCount}
        </span>
      </button>
      <div />
    </div>
  );
}

export function TakeTrackRow({
  number,
  muted,
  soloed,
  onMutedChange,
  onSoloedChange,
  onDelete,
  children,
}: {
  number: number;
  muted: boolean;
  soloed: boolean;
  onMutedChange: (muted: boolean) => void;
  onSoloedChange: (soloed: boolean) => void;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      data-testid="recorder-take-row"
      className="grid h-20 grid-cols-[15rem_1fr] border-b border-neutral-700"
    >
      <div className="sticky left-0 z-20 flex items-start gap-1 border-r border-neutral-700 bg-neutral-900 px-3 py-3 text-xs font-semibold text-neutral-300">
        <span className="mr-auto px-4">Take {number}</span>
        <RecorderMixToggle
          data-testid="recorder-take-mute"
          aria-label={`Mute Take ${number}`}
          active={muted}
          kind="mute"
          onClick={() => onMutedChange(!muted)}
          className="size-7"
          title="Mute take"
        />
        <RecorderMixToggle
          data-testid="recorder-take-solo"
          aria-label={`Solo Take ${number}`}
          active={soloed}
          kind="solo"
          onClick={() => onSoloedChange(!soloed)}
          className="size-7"
          title="Solo take"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label={`Take ${number} actions`} className="size-7">
              <MoreVerticalIcon className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onDelete}>
              <Trash2Icon />
              Delete take
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {children}
    </div>
  );
}
