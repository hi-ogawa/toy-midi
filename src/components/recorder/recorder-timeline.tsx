import {
  LoaderCircleIcon,
  Music2Icon,
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
import type { AudioClip, ClipRegion } from "../../lib/recorder/audio-clip";
import type {
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
import { TrackMenuButton } from "./recorder-tracks";

export function TimelineHeader({
  beatsPerBar,
  pixelsPerBeat,
  viewportStartBeat,
  tempo,
  timelineWidth,
  isAddingAudio,
  isAddingMidi,
  subdivisionsPerBeat,
  onAddAudioTrack,
  onAddMidiTrack,
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
  isAddingMidi: boolean;
  subdivisionsPerBeat: number;
  onAddAudioTrack: () => void;
  onAddMidiTrack: () => void;
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
            data-testid="recorder-add-midi-track"
            onClick={onAddMidiTrack}
            disabled={isAddingMidi}
            className="size-6 hover:bg-neutral-700"
            title={isAddingMidi ? "Loading MIDI track..." : "Add MIDI track"}
          >
            <Music2Icon className="size-3.5" />
          </Button>
          <Button
            onClick={onAddAudioTrack}
            disabled={isAddingAudio}
            className="size-6 hover:bg-neutral-700"
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
            className="size-6 hover:bg-neutral-700"
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
      data-viewport-start-beat={viewportStartBeat}
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
  activeClassName: string;
  clearHoverClassName: string;
  pixelsPerBeat: number;
  subdivisionsPerBeat: number;
  viewportStartBeat: number;
  onChange: (range: RecorderLoopRange) => void;
  onClear: () => void;
}) {
  const testIdPrefix = `recorder-${label.toLowerCase()}`;
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
      data-testid={`${testIdPrefix}-range`}
      className={cn(
        "pointer-events-none absolute inset-y-0 z-10 border-x select-none",
        enabled
          ? activeClassName
          : "border-neutral-500 bg-neutral-400/10 text-neutral-400",
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
        data-testid={`${testIdPrefix}-start`}
        className="pointer-events-auto absolute inset-y-0 -left-1 w-2 cursor-ew-resize"
      />
      <div
        ref={endRef}
        data-testid={`${testIdPrefix}-end`}
        className="pointer-events-auto absolute inset-y-0 -right-1 w-2 cursor-ew-resize"
      />
      <button
        type="button"
        title={`Clear ${label.toLowerCase()} range`}
        data-testid={`${testIdPrefix}-clear`}
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
  testId:
    | "audio"
    | "comp"
    | "clip-lane"
    | "audio-source"
    | "comp-source"
    | "clip-lane-source"
    | "recording"
    | "reference";
  variant?: "audio" | "reference";
  audioView?: AudioView;
  gain?: number;
};

const TIMELINE_EPSILON = 1e-6;

type TimelineClipEditStart =
  | { type: "move"; additive: boolean }
  | { type: "trim-start" | "trim-end"; additive: boolean };

export function AudioTimelineLane({
  beatsPerBar,
  clips,
  regions,
  recordingClipId,
  testId,
  emptyLabel,
  pixelsPerBeat,
  viewportStartBeat,
  tempo,
  viewportWidth,
  isClipSelected,
  isClipEditing,
  onClipClick,
  onEditStart,
  onEditUpdate,
  onEditFinish,
  onEditCancel,
  subdivisionsPerBeat,
  onSeek,
}: {
  beatsPerBar: number;
  clips: readonly AudioClip[];
  regions: readonly ClipRegion[];
  testId: "audio" | "comp" | "clip-lane";
  recordingClipId?: string;
  emptyLabel?: string;
  pixelsPerBeat: number;
  viewportStartBeat: number;
  tempo: number;
  viewportWidth: number;
  isClipSelected: (id: string) => boolean;
  isClipEditing: (id: string) => boolean;
  onClipClick: (id: string, additive: boolean) => void;
  onEditStart: (edit: TimelineClipEditStart & { id: string }) => void;
  onEditUpdate: (delta: number) => void;
  onEditFinish: (delta: number) => void;
  onEditCancel: () => void;
  subdivisionsPerBeat: number;
  onSeek: (position: number) => void;
}) {
  const activeClipIds = new Set(regions.map(({ clip }) => clip.id));
  // Keep the pointer target mounted when its preview becomes fully covered by another clip.
  const activeClips = clips.filter(
    (clip) => activeClipIds.has(clip.id) || isClipEditing(clip.id),
  );
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
      {emptyLabel && clips.length === 0 && recordingClipId === undefined && (
        <div className="absolute inset-0 grid place-items-center text-xs text-neutral-600">
          {emptyLabel}
        </div>
      )}
      {/* Paint resolved regions independently of the editable source bounds. */}
      <div className="pointer-events-none absolute inset-0">
        {regions.map((region, index) => {
          const { clip } = region;
          const isRecording = clip.id === recordingClipId;
          const previous = regions[index - 1];
          const next = regions[index + 1];
          return (
            <TimelineClip
              key={`${clip.id}:${index}`}
              clip={{
                label: isRecording ? "Recording..." : clip.name,
                duration: region.timelineEnd - region.timelineStart,
                offset: region.timelineStart,
                audioOffset: region.timelineStart - clip.timelineOffset,
                audioView: clip.audioView,
                gain: clip.gain,
                testId: isRecording ? "recording" : testId,
              }}
              pixelsPerBeat={pixelsPerBeat}
              viewportStartBeat={viewportStartBeat}
              tempo={tempo}
              viewportWidth={viewportWidth}
              recording={isRecording}
              joinsPrevious={
                previous !== undefined &&
                Math.abs(previous.timelineEnd - region.timelineStart) <
                  TIMELINE_EPSILON
              }
              joinsNext={
                next !== undefined &&
                Math.abs(region.timelineEnd - next.timelineStart) <
                  TIMELINE_EPSILON
              }
            />
          );
        })}
      </div>
      {/* Edit each contributing source across its complete trimmed interval. */}
      {activeClips.map((clip) => (
        <TimelineClip
          key={clip.id}
          clip={{
            label: clip.name,
            duration: clip.trimEnd - clip.trimStart,
            offset: clip.timelineOffset + clip.trimStart,
            testId: `${testId}-source`,
          }}
          pixelsPerBeat={pixelsPerBeat}
          viewportStartBeat={viewportStartBeat}
          tempo={tempo}
          viewportWidth={viewportWidth}
          onClipClick={(additive) => onClipClick(clip.id, additive)}
          onEditStart={(edit) => onEditStart({ ...edit, id: clip.id })}
          onEditUpdate={onEditUpdate}
          onEditFinish={onEditFinish}
          onEditCancel={onEditCancel}
          canTrim
          selected={isClipSelected(clip.id)}
          hidePresentation
        />
      ))}
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
  onEditStart,
  onEditUpdate,
  onEditFinish,
  onEditCancel,
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
  onEditStart: (edit: Extract<TimelineClipEditStart, { type: "move" }>) => void;
  onEditUpdate: (delta: number) => void;
  onEditFinish: (delta: number) => void;
  onEditCancel: () => void;
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
              <TrackMenuButton label="Reference" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
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
            className="size-6"
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
          onEditStart={(edit) => {
            if (edit.type === "move") {
              onEditStart(edit);
            }
          }}
          onEditUpdate={onEditUpdate}
          onEditFinish={onEditFinish}
          onEditCancel={onEditCancel}
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
  onClipClick,
  onEditStart,
  onEditUpdate,
  onEditFinish,
  onEditCancel,
  joinsPrevious = false,
  joinsNext = false,
  recording = false,
  selected = false,
  hidePresentation = false,
  canTrim = false,
}: {
  clip: RecorderTimelineClip;
  pixelsPerBeat: number;
  viewportStartBeat: number;
  tempo: number;
  viewportWidth: number;
  onClipClick?: (additive: boolean) => void;
  onEditStart?: (edit: TimelineClipEditStart) => void;
  onEditUpdate?: (delta: number) => void;
  onEditFinish?: (delta: number) => void;
  onEditCancel?: () => void;
  joinsPrevious?: boolean;
  joinsNext?: boolean;
  recording?: boolean;
  selected?: boolean;
  hidePresentation?: boolean;
  canTrim?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = usePointerGesture({
    onStart: (event) => {
      event.preventDefault();
      event.stopPropagation();
      return {
        additive: event.ctrlKey || event.metaKey,
      };
    },
    onClick: (_event, { data }) => {
      onClipClick?.(data.additive);
    },
    onDragStart: (_event, { data }) => {
      setIsDragging(true);
      onEditStart?.({ type: "move", additive: data.additive });
    },
    onDragMove: (_event, { deltaX }) => {
      onEditUpdate!(beatsToSeconds(deltaX / pixelsPerBeat, tempo));
    },
    onDragEnd: (_event, { deltaX }) => {
      setIsDragging(false);
      onEditFinish?.(beatsToSeconds(deltaX / pixelsPerBeat, tempo));
    },
    onCancel: () => {
      setIsDragging(false);
      onEditCancel?.();
    },
  });
  const trimStartRef = usePointerDrag({
    onStart: (event) => {
      event.preventDefault();
      event.stopPropagation();
      onEditStart!({
        type: "trim-start",
        additive: event.ctrlKey || event.metaKey,
      });
    },
    onMove: (_event, { deltaX }) => {
      onEditUpdate!(beatsToSeconds(deltaX / pixelsPerBeat, tempo));
    },
    onEnd: (_event, { deltaX }) => {
      onEditFinish?.(beatsToSeconds(deltaX / pixelsPerBeat, tempo));
    },
    onCancel: onEditCancel,
  });
  const trimEndRef = usePointerDrag({
    onStart: (event) => {
      event.preventDefault();
      event.stopPropagation();
      onEditStart!({
        type: "trim-end",
        additive: event.ctrlKey || event.metaKey,
      });
    },
    onMove: (_event, { deltaX }) => {
      onEditUpdate!(beatsToSeconds(deltaX / pixelsPerBeat, tempo));
    },
    onEnd: (_event, { deltaX }) => {
      onEditFinish?.(beatsToSeconds(deltaX / pixelsPerBeat, tempo));
    },
    onCancel: onEditCancel,
  });
  const clipClass = recording
    ? "bg-red-400/20 text-red-100"
    : clip.variant === "reference"
      ? "bg-blue-400/10 text-blue-100"
      : "bg-emerald-400/20 text-emerald-100";
  const clipBorderClass = recording
    ? "border-red-400/70"
    : clip.variant === "reference"
      ? "border-blue-400/40"
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
      ref={onEditUpdate ? dragRef : undefined}
      className={cn(
        "absolute inset-y-1 rounded-sm text-[11px]",
        hidePresentation ? "bg-transparent text-transparent" : clipClass,
        onEditUpdate && "cursor-ew-resize select-none",
        onEditStart && "cursor-pointer",
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
                gain={clip.gain}
                sourceStart={clip.audioOffset ?? 0}
                visibleStart={visibleStart}
                visibleEnd={visibleEnd}
                pixelsPerSecond={pixelsPerSecond}
              />
            )}
            <div className="absolute left-1 top-0.5 z-10 whitespace-nowrap">
              <span className="mr-1.5">{clip.label}</span>
              {onEditUpdate && clip.offset > 0 && (
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
      {canTrim && (
        <div
          ref={trimStartRef}
          data-testid="recorder-clip-trim-start"
          onClick={(event) => event.stopPropagation()}
          className="absolute inset-y-0 -left-[3px] z-20 w-1.5 cursor-ew-resize after:absolute after:inset-y-0 after:left-[3px] after:w-0.5 after:bg-transparent hover:after:bg-white/50"
        />
      )}
      {canTrim && (
        <div
          ref={trimEndRef}
          data-testid="recorder-clip-trim-end"
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
