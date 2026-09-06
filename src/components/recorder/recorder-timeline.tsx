import {
  LoaderCircleIcon,
  MoreVerticalIcon,
  PlusIcon,
  UploadIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { usePointerDrag } from "../../hooks/use-pointer-drag";
import { usePointerGesture } from "../../hooks/use-pointer-gesture";
import { AudioView } from "../../lib/audio-view";
import { clamp, snapToGrid } from "../../lib/music";
import type {
  RecorderRuntimeState,
  RecorderLoopRange,
  RecorderLoopState,
  RecorderPunchRange,
  RecorderPunchState,
  ReferenceVideoState,
} from "../../lib/recorder/runtime";
import { formatTimeMinutes } from "../../lib/time-format";
import {
  beatsToSeconds,
  getVisibleBarInterval,
  secondsToBeats,
} from "../../lib/timeline";
import { getTimelineGridBackground } from "../../lib/timeline-grid";
import { AudioWaveformView } from "../audio-waveform";
import { openFilePicker } from "../file-drop-input";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../ui/utils";
import { RecorderMixToggle } from "./recorder-mix-toggle";
import type {
  RecorderClipMoveSnapshot,
  RecorderClipTrimSnapshot,
} from "./use-recorder-clip-interaction";

export function TimelineHeader({
  beatsPerBar,
  pixelsPerBeat,
  viewportStartBeat,
  tempo,
  timelineWidth,
  isAddingAudio,
  subdivisionsPerBeat,
  onAddAudioTrack,
  onAddAudioFile,
  onSeek,
  loop,
  punch,
  onLoopRangeChange,
  onLoopRangeClear,
  onPunchRangeChange,
  onPunchRangeClear,
}: {
  beatsPerBar: number;
  pixelsPerBeat: number;
  viewportStartBeat: number;
  tempo: number;
  timelineWidth: number;
  isAddingAudio: boolean;
  subdivisionsPerBeat: number;
  onAddAudioTrack: () => void;
  onAddAudioFile: (file: File) => void;
  onSeek: (position: number) => void;
  loop: RecorderLoopState;
  punch: RecorderPunchState;
  onLoopRangeChange: (range: RecorderLoopRange) => void;
  onLoopRangeClear: () => void;
  onPunchRangeChange: (range: RecorderPunchRange) => void;
  onPunchRangeClear: () => void;
}) {
  return (
    <div className="sticky top-0 z-40 grid h-10 grid-cols-[15rem_1fr] border-b border-neutral-700 bg-neutral-800">
      <div className="sticky left-0 z-20 flex items-center border-r border-neutral-700 bg-neutral-800 px-3 text-xs font-semibold">
        <span>Tracks</span>
        <div className="flex-1" />
        <div className="flex gap-1">
          <Button
            onClick={onAddAudioTrack}
            disabled={isAddingAudio}
            className="size-7 hover:bg-neutral-700"
            title="Add empty audio track"
          >
            <PlusIcon className="size-3.5" />
          </Button>
          <Button
            data-testid="recorder-add-audio-file"
            disabled={isAddingAudio}
            onClick={() =>
              openFilePicker({
                accept: "audio/*,.zip,application/zip",
                onFile: onAddAudioFile,
              })
            }
            title={
              isAddingAudio ? "Loading audio..." : "Add audio tracks from file"
            }
            className="size-7 hover:bg-neutral-700"
          >
            {isAddingAudio ? (
              <LoaderCircleIcon className="size-3.5 animate-spin" />
            ) : (
              <UploadIcon className="size-3.5" />
            )}
          </Button>
        </div>
      </div>
      <TimelineRuler
        beatsPerBar={beatsPerBar}
        pixelsPerBeat={pixelsPerBeat}
        viewportStartBeat={viewportStartBeat}
        tempo={tempo}
        subdivisionsPerBeat={subdivisionsPerBeat}
        timelineWidth={timelineWidth}
        onSeek={onSeek}
        loop={loop}
        punch={punch}
        onLoopRangeChange={onLoopRangeChange}
        onLoopRangeClear={onLoopRangeClear}
        onPunchRangeChange={onPunchRangeChange}
        onPunchRangeClear={onPunchRangeClear}
      />
    </div>
  );
}

function TimelineRuler({
  beatsPerBar,
  pixelsPerBeat,
  viewportStartBeat,
  tempo,
  subdivisionsPerBeat,
  timelineWidth,
  onSeek,
  loop,
  punch,
  onLoopRangeChange,
  onLoopRangeClear,
  onPunchRangeChange,
  onPunchRangeClear,
}: {
  beatsPerBar: number;
  pixelsPerBeat: number;
  viewportStartBeat: number;
  tempo: number;
  subdivisionsPerBeat: number;
  timelineWidth: number;
  onSeek: (position: number) => void;
  loop: RecorderLoopState;
  punch: RecorderPunchState;
  onLoopRangeChange: (range: RecorderLoopRange) => void;
  onLoopRangeClear: () => void;
  onPunchRangeChange: (range: RecorderPunchRange) => void;
  onPunchRangeClear: () => void;
}) {
  const labelEveryBars = getVisibleBarInterval({
    barWidth: beatsPerBar * pixelsPerBeat,
    minimumPixelSpacing: 48,
  });
  const labelEveryBeats = labelEveryBars * beatsPerBar;
  const firstLabelBeat =
    Math.floor(viewportStartBeat / labelEveryBeats) * labelEveryBeats;
  const visibleBeats = timelineWidth / pixelsPerBeat;
  const labelCount =
    Math.ceil(
      (viewportStartBeat + visibleBeats - firstLabelBeat) / labelEveryBeats,
    ) + 1;
  return (
    <div
      data-testid="recorder-timeline-ruler"
      className="relative cursor-pointer bg-neutral-800 font-mono text-[10px] text-neutral-400"
      {...getTimelineSurfaceProps({
        beatsPerBar,
        onSeek,
        pixelsPerBeat,
        tempo,
        viewportStartBeat,
        subdivisionsPerBeat,
      })}
    >
      {loop.range && (
        <LoopRange
          range={loop.range}
          enabled={loop.enabled}
          pixelsPerBeat={pixelsPerBeat}
          subdivisionsPerBeat={subdivisionsPerBeat}
          viewportStartBeat={viewportStartBeat}
          onChange={onLoopRangeChange}
          onClear={onLoopRangeClear}
        />
      )}
      {punch.range && (
        <TimelineRange
          range={punch.range}
          enabled={punch.enabled}
          label="Punch"
          testId="recorder-punch"
          activeClassName="border-amber-300 bg-amber-400/20 text-amber-100"
          clearHoverClassName="hover:bg-amber-200/20"
          pixelsPerBeat={pixelsPerBeat}
          subdivisionsPerBeat={subdivisionsPerBeat}
          viewportStartBeat={viewportStartBeat}
          onChange={onPunchRangeChange}
          onClear={onPunchRangeClear}
        />
      )}
      {Array.from({ length: Math.max(0, labelCount) }, (_, index) => {
        const beat = firstLabelBeat + index * labelEveryBeats;
        return (
          <span
            key={beat}
            className="absolute bottom-1.5"
            style={{ left: (beat - viewportStartBeat) * pixelsPerBeat + 6 }}
          >
            {beat / beatsPerBar + 1}
          </span>
        );
      })}
    </div>
  );
}

function LoopRange({
  range,
  enabled,
  pixelsPerBeat,
  subdivisionsPerBeat,
  viewportStartBeat,
  onChange,
  onClear,
}: {
  range: RecorderLoopRange;
  enabled: boolean;
  pixelsPerBeat: number;
  subdivisionsPerBeat: number;
  viewportStartBeat: number;
  onChange: (range: RecorderLoopRange) => void;
  onClear: () => void;
}) {
  return (
    <TimelineRange
      range={range}
      enabled={enabled}
      label="Loop"
      testId="recorder-loop"
      activeClassName="border-violet-300 bg-violet-400/20 text-violet-100"
      clearHoverClassName="hover:bg-violet-200/20"
      pixelsPerBeat={pixelsPerBeat}
      subdivisionsPerBeat={subdivisionsPerBeat}
      viewportStartBeat={viewportStartBeat}
      onChange={onChange}
      onClear={onClear}
    />
  );
}

function TimelineRange({
  range,
  enabled,
  label,
  testId,
  activeClassName,
  clearHoverClassName,
  pixelsPerBeat,
  subdivisionsPerBeat,
  viewportStartBeat,
  onChange,
  onClear,
}: {
  range: RecorderLoopRange | RecorderPunchRange;
  enabled: boolean;
  label: string;
  testId: "recorder-loop" | "recorder-punch";
  activeClassName: string;
  clearHoverClassName: string;
  pixelsPerBeat: number;
  subdivisionsPerBeat: number;
  viewportStartBeat: number;
  onChange: (range: RecorderLoopRange) => void;
  onClear: () => void;
}) {
  const minimumLength = 1 / subdivisionsPerBeat;
  const dragRef = usePointerGesture({
    onStart: (event) => {
      event.preventDefault();
      event.stopPropagation();
      return range;
    },
    onDragMove: (_event, { data, deltaX }) => {
      const delta = snapToGrid(deltaX / pixelsPerBeat, 1 / subdivisionsPerBeat);
      const startBeat = Math.max(0, data.startBeat + delta);
      onChange({
        startBeat,
        endBeat: startBeat + data.endBeat - data.startBeat,
      });
    },
  });
  const startRef = usePointerGesture({
    onStart: (event) => {
      event.preventDefault();
      event.stopPropagation();
      return range;
    },
    onDragMove: (_event, { data, deltaX }) => {
      const delta = snapToGrid(deltaX / pixelsPerBeat, 1 / subdivisionsPerBeat);
      onChange({
        ...data,
        startBeat: clamp(
          data.startBeat + delta,
          0,
          data.endBeat - minimumLength,
        ),
      });
    },
  });
  const endRef = usePointerGesture({
    onStart: (event) => {
      event.preventDefault();
      event.stopPropagation();
      return range;
    },
    onDragMove: (_event, { data, deltaX }) => {
      const delta = snapToGrid(deltaX / pixelsPerBeat, 1 / subdivisionsPerBeat);
      onChange({
        ...data,
        endBeat: Math.max(data.startBeat + minimumLength, data.endBeat + delta),
      });
    },
  });
  return (
    <div
      data-testid={`${testId}-range`}
      className={cn(
        "pointer-events-none absolute inset-y-0 z-10 border-x select-none",
        enabled
          ? activeClassName
          : "border-dashed border-neutral-500 bg-transparent text-neutral-400",
      )}
      style={{
        left: (range.startBeat - viewportStartBeat) * pixelsPerBeat,
        width: (range.endBeat - range.startBeat) * pixelsPerBeat,
      }}
    >
      <span
        ref={dragRef}
        className="pointer-events-auto absolute left-1 top-1 z-10 max-w-[calc(100%-1.5rem)] cursor-grab truncate font-sans text-[9px] font-semibold uppercase tracking-wide active:cursor-grabbing"
        title={
          enabled
            ? `Move ${label.toLowerCase()} range`
            : `${label} off. Drag to move range; enable ${label.toLowerCase()} in the toolbar.`
        }
      >
        {label}
        {!enabled && " off"}
      </span>
      <div
        ref={startRef}
        data-testid={`${testId}-start`}
        className="pointer-events-auto absolute inset-y-0 -left-1 w-2 cursor-ew-resize"
      />
      <div
        ref={endRef}
        data-testid={`${testId}-end`}
        className="pointer-events-auto absolute inset-y-0 -right-1 w-2 cursor-ew-resize"
      />
      <button
        type="button"
        title={`Clear ${label.toLowerCase()} range`}
        data-testid={`${testId}-clear`}
        className={cn(
          "pointer-events-auto absolute right-0.5 top-0.5 grid size-4 place-items-center rounded",
          enabled ? clearHoverClassName : "hover:bg-neutral-400/20",
        )}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onClear();
        }}
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
}

type RecorderTimelineClip = {
  label: string;
  /** Visible clip length on the timeline, in seconds. */
  duration: number;
  /** Absolute timeline position where the visible clip begins. */
  offset: number;
  /** Visible clip start relative to the source buffer, in seconds. */
  audioOffset?: number;
  testId: "audio" | "comp" | "recording" | "reference" | "take" | "take-lane";
  variant?: "audio" | "reference";
  audioView?: AudioView;
};

const TIMELINE_EPSILON = 1e-6;

export function TakeTimelineLane({
  takes,
  regions,
  pendingRecording,
  captureStatus,
  isTakeSelected,
  beatsPerBar,
  subdivisionsPerBeat,
  pixelsPerBeat,
  tempo,
  viewportStartBeat,
  viewportWidth,
  onSeek,
  onTakeDragStart,
  onTakeClick,
  onTakeDragMove,
  onTakeTrimStart,
  onTakeTrimMove,
}: {
  takes: RecorderRuntimeState["recordingTrack"]["takes"];
  regions: RecorderRuntimeState["takeRegions"];
  pendingRecording: RecorderRuntimeState["pendingRecording"];
  captureStatus: RecorderRuntimeState["captureStatus"];
  isTakeSelected: (id: string) => boolean;
  beatsPerBar: number;
  subdivisionsPerBeat: number;
  pixelsPerBeat: number;
  tempo: number;
  viewportStartBeat: number;
  viewportWidth: number;
  onSeek: (position: number) => void;
  onTakeDragStart: (id: string, additive: boolean) => RecorderClipMoveSnapshot;
  onTakeClick: (id: string, additive: boolean) => void;
  onTakeDragMove: (snapshot: RecorderClipMoveSnapshot, delta: number) => void;
  onTakeTrimStart: (
    id: string,
    edge: "start" | "end",
  ) => RecorderClipTrimSnapshot;
  onTakeTrimMove: (snapshot: RecorderClipTrimSnapshot, delta: number) => void;
}) {
  const activeTakeIds = new Set(regions.map(({ take }) => take.id));
  const activeTakes = takes.filter((take) => activeTakeIds.has(take.id));

  return (
    <div
      className="relative overflow-hidden bg-neutral-900"
      {...getTimelineSurfaceProps({
        beatsPerBar,
        onSeek,
        pixelsPerBeat,
        tempo,
        viewportStartBeat,
        subdivisionsPerBeat,
      })}
    >
      {takes.length === 0 && !pendingRecording && (
        <div className="absolute inset-0 grid place-items-center text-xs text-neutral-600">
          Enable input, place the playhead, then record
        </div>
      )}
      <div className="pointer-events-none absolute inset-0">
        {regions.map((region, index) => {
          const { take } = region;
          const isPendingRecording = take.id === pendingRecording?.id;
          const audioOffset = region.timelineStart - take.timelineOffset;
          const previous = regions[index - 1];
          const next = regions[index + 1];
          const joinsPrevious =
            previous !== undefined &&
            Math.abs(previous.timelineEnd - region.timelineStart) <
              TIMELINE_EPSILON;
          const joinsNext =
            next !== undefined &&
            Math.abs(region.timelineEnd - next.timelineStart) <
              TIMELINE_EPSILON;
          return (
            <TimelineClip
              key={`${take.id}:${index}`}
              clip={{
                label: isPendingRecording
                  ? captureStatus === "processing"
                    ? "Finalizing..."
                    : "Recording..."
                  : `Take ${take.number}`,
                duration: region.timelineEnd - region.timelineStart,
                offset: region.timelineStart,
                audioOffset,
                testId: isPendingRecording ? "recording" : "comp",
                audioView: take.audioView,
              }}
              pixelsPerBeat={pixelsPerBeat}
              viewportStartBeat={viewportStartBeat}
              tempo={tempo}
              viewportWidth={viewportWidth}
              joinsPrevious={joinsPrevious}
              joinsNext={joinsNext}
              recording={isPendingRecording}
            />
          );
        })}
      </div>
      {activeTakes.map((take) => (
        <TimelineClip
          key={take.id}
          clip={{
            label: `Take ${take.number}`,
            duration: take.trimEnd - take.trimStart,
            offset: take.timelineOffset + take.trimStart,
            testId: "take",
          }}
          pixelsPerBeat={pixelsPerBeat}
          viewportStartBeat={viewportStartBeat}
          tempo={tempo}
          viewportWidth={viewportWidth}
          onClipDragStart={(additive) => onTakeDragStart(take.id, additive)}
          onClipClick={(additive) => onTakeClick(take.id, additive)}
          onClipDragMove={onTakeDragMove}
          onTrimStart={(edge) => onTakeTrimStart(take.id, edge)}
          onTrimMove={onTakeTrimMove}
          selected={isTakeSelected(take.id)}
          hidePresentation
        />
      ))}
    </div>
  );
}

export function TimelineLane({
  beatsPerBar,
  clip,
  emptyLabel,
  pixelsPerBeat,
  viewportStartBeat,
  tempo,
  viewportWidth,
  selected,
  onClipDragStart,
  onClipClick,
  onClipDragMove,
  onTrimStart,
  onTrimMove,
  subdivisionsPerBeat,
  onSeek,
}: {
  beatsPerBar: number;
  clip?: RecorderTimelineClip;
  emptyLabel: string;
  pixelsPerBeat: number;
  viewportStartBeat: number;
  tempo: number;
  viewportWidth: number;
  selected: boolean;
  onClipDragStart: (additive: boolean) => RecorderClipMoveSnapshot;
  onClipClick: (additive: boolean) => void;
  onClipDragMove: (snapshot: RecorderClipMoveSnapshot, delta: number) => void;
  onTrimStart?: (edge: "start" | "end") => RecorderClipTrimSnapshot;
  onTrimMove?: (snapshot: RecorderClipTrimSnapshot, delta: number) => void;
  subdivisionsPerBeat: number;
  onSeek: (position: number) => void;
}) {
  return (
    <div
      className="relative overflow-hidden bg-neutral-900"
      {...getTimelineSurfaceProps({
        beatsPerBar,
        onSeek,
        pixelsPerBeat,
        tempo,
        viewportStartBeat,
        subdivisionsPerBeat,
      })}
    >
      {clip ? (
        <TimelineClip
          clip={clip}
          pixelsPerBeat={pixelsPerBeat}
          viewportStartBeat={viewportStartBeat}
          tempo={tempo}
          viewportWidth={viewportWidth}
          selected={selected}
          onClipDragStart={onClipDragStart}
          onClipClick={onClipClick}
          onClipDragMove={onClipDragMove}
          onTrimStart={onTrimStart}
          onTrimMove={onTrimMove}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-xs text-neutral-600">
          {emptyLabel}
        </div>
      )}
    </div>
  );
}

export function ReferenceTimelineRow({
  referenceVideo,
  position,
  beatsPerBar,
  subdivisionsPerBeat,
  pixelsPerBeat,
  tempo,
  viewportStartBeat,
  viewportWidth,
  onSeek,
  selected,
  onClipClick,
  onClipDragStart,
  onClipDragMove,
  muted,
  onMutedChange,
  onRemove,
}: {
  referenceVideo: ReferenceVideoState;
  position: number;
  beatsPerBar: number;
  subdivisionsPerBeat: number;
  pixelsPerBeat: number;
  tempo: number;
  viewportStartBeat: number;
  viewportWidth: number;
  onSeek: (position: number) => void;
  selected: boolean;
  onClipClick: (additive: boolean) => void;
  onClipDragStart: (additive: boolean) => RecorderClipMoveSnapshot;
  onClipDragMove: (snapshot: RecorderClipMoveSnapshot, delta: number) => void;
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
  onRemove: () => void;
}) {
  return (
    <div
      data-testid="recorder-reference-track"
      className="grid h-15 grid-cols-[15rem_1fr] border-b border-neutral-700"
    >
      <div className="sticky left-0 z-20 grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[1.75rem_auto] content-start gap-x-2 border-r border-neutral-700 bg-neutral-800 px-3 py-2">
        <div className="min-w-0 self-center truncate text-xs font-semibold">
          Reference
        </div>
        <div className="flex self-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                title="Reference actions"
                className="size-7 border-neutral-600 text-neutral-300 hover:bg-neutral-700"
              >
                <MoreVerticalIcon className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onRemove} className="text-red-400">
                <Trash2Icon />
                Remove reference video
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <RecorderMixToggle
            data-testid="recorder-reference-video-mute"
            active={muted}
            kind="mute"
            onClick={() => onMutedChange(!muted)}
            className="size-7"
            title={muted ? "Unmute Reference" : "Mute Reference"}
          />
        </div>
        <div className="col-span-2 flex items-center gap-1.5 font-mono text-[11px] leading-3.5 text-neutral-400">
          <span>
            {formatTimeMinutes(
              Math.max(0, position - referenceVideo.timelineStart),
            )}
          </span>
          <span className="text-neutral-600">/</span>
          <span>{formatTimeMinutes(referenceVideo.duration)}</span>
        </div>
      </div>
      <div
        className="relative overflow-hidden bg-neutral-900"
        {...getTimelineSurfaceProps({
          beatsPerBar,
          onSeek,
          pixelsPerBeat,
          tempo,
          viewportStartBeat,
          subdivisionsPerBeat,
        })}
      >
        <TimelineClip
          clip={{
            label: referenceVideo.title ?? "YouTube reference",
            offset: referenceVideo.timelineStart,
            duration: referenceVideo.duration,
            testId: "reference",
            variant: "reference",
          }}
          pixelsPerBeat={pixelsPerBeat}
          tempo={tempo}
          viewportStartBeat={viewportStartBeat}
          viewportWidth={viewportWidth}
          selected={selected}
          onClipClick={onClipClick}
          onClipDragStart={onClipDragStart}
          onClipDragMove={onClipDragMove}
        />
      </div>
    </div>
  );
}

function TimelineClip({
  clip,
  pixelsPerBeat,
  viewportStartBeat,
  tempo,
  viewportWidth,
  onClipDragStart,
  onClipClick,
  onClipDragMove,
  onTrimStart,
  onTrimMove,
  joinsPrevious = false,
  joinsNext = false,
  recording = false,
  selected = false,
  hidePresentation = false,
}: {
  clip: RecorderTimelineClip;
  pixelsPerBeat: number;
  viewportStartBeat: number;
  tempo: number;
  viewportWidth: number;
  onClipDragStart?: (additive: boolean) => RecorderClipMoveSnapshot;
  onClipClick?: (additive: boolean) => void;
  onClipDragMove?: (snapshot: RecorderClipMoveSnapshot, delta: number) => void;
  onTrimStart?: (edge: "start" | "end") => RecorderClipTrimSnapshot;
  onTrimMove?: (snapshot: RecorderClipTrimSnapshot, delta: number) => void;
  joinsPrevious?: boolean;
  joinsNext?: boolean;
  recording?: boolean;
  selected?: boolean;
  hidePresentation?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = usePointerGesture({
    onStart: (event) => {
      event.preventDefault();
      event.stopPropagation();
      return {
        additive: event.ctrlKey || event.metaKey,
        snapshot: undefined as RecorderClipMoveSnapshot | undefined,
      };
    },
    onClick: (_event, { data }) => {
      onClipClick?.(data.additive);
    },
    onDragStart: (_event, { data }) => {
      setIsDragging(true);
      data.snapshot = onClipDragStart?.(data.additive);
    },
    onDragMove: (_event, { data, deltaX }) => {
      onClipDragMove!(
        data.snapshot!,
        beatsToSeconds(deltaX / pixelsPerBeat, tempo),
      );
    },
    onDragEnd: () => {
      setIsDragging(false);
    },
    onCancel: () => {
      setIsDragging(false);
    },
  });
  const trimStartRef = usePointerDrag({
    onStart: (event) => {
      event.preventDefault();
      event.stopPropagation();
      return {
        startClientX: event.clientX,
        snapshot: onTrimStart!("start"),
      };
    },
    onMove: (event, drag) => {
      const delta = beatsToSeconds(
        (event.clientX - drag.startClientX) / pixelsPerBeat,
        tempo,
      );
      onTrimMove!(drag.snapshot, delta);
    },
  });
  const trimEndRef = usePointerDrag({
    onStart: (event) => {
      event.preventDefault();
      event.stopPropagation();
      return {
        startClientX: event.clientX,
        snapshot: onTrimStart!("end"),
      };
    },
    onMove: (event, drag) => {
      const delta = beatsToSeconds(
        (event.clientX - drag.startClientX) / pixelsPerBeat,
        tempo,
      );
      onTrimMove!(drag.snapshot, delta);
    },
  });
  const clipClass = recording
    ? "bg-red-400/20 text-red-100"
    : clip.variant === "reference"
      ? "bg-neutral-400/15 text-neutral-200"
      : "bg-emerald-400/20 text-emerald-100";
  const clipBorderClass = recording
    ? "border-red-400/70"
    : clip.variant === "reference"
      ? "border-neutral-400/60"
      : "border-emerald-400/60";
  const clipStartBeat = secondsToBeats(clip.offset, tempo);
  const pixelsPerSecond = secondsToBeats(1, tempo) * pixelsPerBeat;
  const clipWidth = Math.max(2, clip.duration * pixelsPerSecond);
  const visibleStart = Math.max(
    clip.audioOffset ?? 0,
    (clip.audioOffset ?? 0) +
      beatsToSeconds(viewportStartBeat - clipStartBeat, tempo),
  );
  const visibleEnd = Math.min(
    (clip.audioOffset ?? 0) + clip.duration,
    (clip.audioOffset ?? 0) +
      beatsToSeconds(
        viewportStartBeat + viewportWidth / pixelsPerBeat - clipStartBeat,
        tempo,
      ),
  );
  return (
    <div
      data-testid={`recorder-clip-${clip.testId}`}
      data-selected={selected ? "true" : undefined}
      ref={onClipDragMove ? dragRef : undefined}
      className={cn(
        "absolute inset-y-1 rounded-sm text-[11px]",
        hidePresentation ? "bg-transparent text-transparent" : clipClass,
        onClipDragMove && "cursor-ew-resize select-none",
        onClipDragStart && "cursor-pointer",
        joinsPrevious && "rounded-l-none",
        joinsNext && "rounded-r-none",
        isDragging && !hidePresentation && "brightness-125",
      )}
      style={{
        left: (clipStartBeat - viewportStartBeat) * pixelsPerBeat,
        width: clipWidth,
      }}
    >
      {!hidePresentation && (
        <>
          <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
            {clip.audioView && visibleEnd > visibleStart && (
              <AudioWaveformView
                audioView={clip.audioView}
                sourceStart={clip.audioOffset ?? 0}
                visibleStart={visibleStart}
                visibleEnd={visibleEnd}
                pixelsPerSecond={pixelsPerSecond}
              />
            )}
            <div className="absolute left-1 top-0.5 z-10 whitespace-nowrap">
              <span className="mr-1.5">{clip.label}</span>
              {onClipDragMove && clip.offset > 0 && (
                <span className="opacity-75">+{clip.offset.toFixed(3)}s</span>
              )}
            </div>
          </div>
          <div
            className={cn(
              "pointer-events-none absolute inset-0 rounded-[inherit] border",
              clipBorderClass,
              joinsNext && "border-r-0",
            )}
          />
        </>
      )}
      {(selected || (hidePresentation && isDragging)) && (
        <div
          data-testid="recorder-clip-selection"
          className="pointer-events-none absolute inset-0 rounded-[inherit] border border-sky-300 ring-1 ring-inset ring-sky-300"
        />
      )}
      {onTrimStart && (
        <div
          ref={trimStartRef}
          data-testid="recorder-take-trim-start"
          onClick={(event) => event.stopPropagation()}
          className="absolute inset-y-0 -left-[3px] z-20 w-1.5 cursor-ew-resize after:absolute after:inset-y-0 after:left-[3px] after:w-0.5 after:bg-transparent hover:after:bg-white/50"
        />
      )}
      {onTrimStart && (
        <div
          ref={trimEndRef}
          data-testid="recorder-take-trim-end"
          onClick={(event) => event.stopPropagation()}
          className="absolute inset-y-0 -right-[3px] z-20 w-1.5 cursor-ew-resize after:absolute after:inset-y-0 after:right-[3px] after:w-0.5 after:bg-transparent hover:after:bg-white/50"
        />
      )}
    </div>
  );
}

function getTimelineGridStyle({
  beatsPerBar,
  pixelsPerBeat,
  viewportStartBeat,
  subdivisionsPerBeat,
}: {
  beatsPerBar: number;
  pixelsPerBeat: number;
  viewportStartBeat: number;
  subdivisionsPerBeat: number;
}): React.CSSProperties {
  return getTimelineGridBackground({
    beatsPerBar,
    colors: {
      bar: "rgb(82 82 82)",
      beat: "rgb(64 64 64)",
      subdivision: "rgb(51 51 51)",
    },
    minimumPixelSpacing: 8,
    pixelsPerBeat,
    viewportStartBeat,
    subdivisionsPerBeat,
  });
}

function getTimelineSurfaceProps({
  beatsPerBar,
  onSeek,
  pixelsPerBeat,
  subdivisionsPerBeat,
  tempo,
  viewportStartBeat,
}: {
  beatsPerBar: number;
  onSeek: (position: number) => void;
  pixelsPerBeat: number;
  subdivisionsPerBeat: number;
  tempo: number;
  viewportStartBeat: number;
}): React.HTMLAttributes<HTMLElement> {
  return {
    style: getTimelineGridStyle({
      beatsPerBar,
      pixelsPerBeat,
      subdivisionsPerBeat,
      viewportStartBeat,
    }),
    onPointerDown: (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const beat = snapToGrid(
        (event.clientX - rect.left) / pixelsPerBeat + viewportStartBeat,
        1 / subdivisionsPerBeat,
      );
      onSeek(beatsToSeconds(Math.max(0, beat), tempo));
    },
  };
}
