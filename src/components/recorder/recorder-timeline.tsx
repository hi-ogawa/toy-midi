import {
  LoaderCircleIcon,
  PlusIcon,
  UploadIcon,
  VideoIcon,
} from "lucide-react";
import { useState } from "react";
import { usePointerDrag } from "../../hooks/use-pointer-drag";
import { usePointerGesture } from "../../hooks/use-pointer-gesture";
import { AudioView } from "../../lib/audio-view";
import type {
  RecorderRuntimeState,
  ReferenceVideoState,
} from "../../lib/recorder/runtime";
import {
  beatsToSeconds,
  getVisibleBarInterval,
  secondsToBeats,
} from "../../lib/timeline";
import { getTimelineGridBackground } from "../../lib/timeline-grid";
import { AudioWaveformView } from "../audio-waveform";
import { openFilePicker } from "../file-drop-input";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";
import type {
  RecorderClipMoveSnapshot,
  RecorderClipTrimSnapshot,
} from "./use-recorder-clip-interaction";

const REFERENCE_VIDEO_FALLBACK_DURATION = 3 * 60 + 32;

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
}) {
  return (
    <div
      data-testid="recorder-reference-track"
      className="grid h-20 grid-cols-[15rem_1fr] border-b border-neutral-700"
    >
      <div className="sticky left-0 z-20 flex items-center gap-3 border-r border-neutral-700 bg-neutral-800 px-3">
        <div className="grid size-9 shrink-0 place-items-center rounded bg-red-950 text-red-300">
          <VideoIcon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold">Reference</div>
          <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-neutral-400">
            <span>
              {formatReferenceTime(
                Math.max(0, position - referenceVideo.timelineStart),
              )}
            </span>
            <span className="text-neutral-600">/</span>
            <span>
              {formatReferenceTime(
                referenceVideo.duration ?? REFERENCE_VIDEO_FALLBACK_DURATION,
              )}
            </span>
          </div>
        </div>
        <Button
          data-testid="recorder-reference-video-mute"
          onClick={() => onMutedChange(!muted)}
          aria-pressed={muted}
          title={muted ? "Unmute Reference" : "Mute Reference"}
          className={cn(
            "ml-auto size-7 border-neutral-600 text-xs font-semibold text-neutral-300 hover:bg-neutral-700",
            muted &&
              "border-emerald-600 bg-emerald-700 text-white hover:bg-emerald-600",
          )}
        >
          M
        </Button>
      </div>
      <div
        className="relative overflow-hidden bg-neutral-900"
        style={getTimelineGridStyle({
          beatsPerBar,
          pixelsPerBeat,
          viewportStartBeat,
          subdivisionsPerBeat,
        })}
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const beat = Math.max(
            0,
            (event.clientX - rect.left) / pixelsPerBeat + viewportStartBeat,
          );
          onSeek(beatsToSeconds(beat, tempo));
        }}
      >
        <ReferenceTimelineClip
          label={referenceVideo.title ?? "YouTube reference"}
          offset={referenceVideo.timelineStart}
          duration={
            referenceVideo.duration ?? REFERENCE_VIDEO_FALLBACK_DURATION
          }
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

function ReferenceTimelineClip({
  label,
  offset,
  duration,
  pixelsPerBeat,
  tempo,
  viewportStartBeat,
  viewportWidth,
  selected,
  onClipClick,
  onClipDragStart,
  onClipDragMove,
}: {
  label: string;
  offset: number;
  duration: number;
  pixelsPerBeat: number;
  tempo: number;
  viewportStartBeat: number;
  viewportWidth: number;
  selected: boolean;
  onClipClick: (additive: boolean) => void;
  onClipDragStart: (additive: boolean) => RecorderClipMoveSnapshot;
  onClipDragMove: (snapshot: RecorderClipMoveSnapshot, delta: number) => void;
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
    onClick: (_event, { data }) => onClipClick(data.additive),
    onDragStart: (_event, { data }) => {
      setIsDragging(true);
      data.snapshot = onClipDragStart(data.additive);
    },
    onDragMove: (_event, { data, deltaX }) => {
      onClipDragMove(
        data.snapshot!,
        beatsToSeconds(deltaX / pixelsPerBeat, tempo),
      );
    },
    onDragEnd: () => setIsDragging(false),
    onCancel: () => setIsDragging(false),
  });
  const left =
    (secondsToBeats(offset, tempo) - viewportStartBeat) * pixelsPerBeat;
  const width = secondsToBeats(duration, tempo) * pixelsPerBeat;
  const visibleLabelLeft = Math.max(0, -left) + 8;
  return (
    <div
      data-testid="recorder-clip-reference"
      data-selected={selected ? "true" : undefined}
      ref={dragRef}
      className={cn(
        "absolute inset-y-1 cursor-ew-resize select-none overflow-hidden rounded-sm border border-amber-400/60 bg-amber-400/15 text-amber-50",
        isDragging && "brightness-125",
      )}
      style={{ left, width }}
    >
      <div
        className="absolute top-0.5 flex max-w-[calc(100vw-17rem)] items-center whitespace-nowrap text-[11px]"
        style={{ left: Math.min(visibleLabelLeft, viewportWidth - 8) }}
      >
        <span className="mr-1.5 truncate">{label}</span>
        {offset !== 0 && (
          <span className="mr-1.5 font-mono opacity-75">
            {offset > 0 ? "+" : ""}
            {offset.toFixed(3)}s
          </span>
        )}
        <span className="font-mono opacity-75">
          {formatReferenceTime(duration)}
        </span>
      </div>
      {selected && (
        <div className="pointer-events-none absolute inset-0 rounded-[inherit] border border-white/90" />
      )}
    </div>
  );
}

function formatReferenceTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

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
}) {
  return (
    <div className="sticky top-0 z-10 grid h-10 grid-cols-[15rem_1fr] border-b border-neutral-700 bg-neutral-800">
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
}: {
  beatsPerBar: number;
  pixelsPerBeat: number;
  viewportStartBeat: number;
  tempo: number;
  subdivisionsPerBeat: number;
  timelineWidth: number;
  onSeek: (position: number) => void;
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
      className="relative cursor-pointer font-mono text-[10px] text-neutral-400"
      style={getTimelineGridStyle({
        beatsPerBar,
        pixelsPerBeat,
        viewportStartBeat,
        subdivisionsPerBeat,
      })}
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const beat = Math.max(
          0,
          (event.clientX - rect.left) / pixelsPerBeat + viewportStartBeat,
        );
        onSeek(beatsToSeconds(beat, tempo));
      }}
    >
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

type RecorderTimelineClip = {
  label: string;
  /** Visible clip length on the timeline, in seconds. */
  duration: number;
  /** Absolute timeline position where the visible clip begins. */
  offset: number;
  /** Complete source-buffer length, used to render a trimmed waveform. */
  audioDuration?: number;
  /** Visible clip start relative to the source buffer, in seconds. */
  audioOffset?: number;
  // TODO: Replace variant and presentation flags with explicit clip concerns.
  variant: "audio" | "comp" | "take";
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
  return (
    <div
      className="relative overflow-hidden bg-neutral-900"
      style={getTimelineGridStyle({
        beatsPerBar,
        pixelsPerBeat,
        viewportStartBeat,
        subdivisionsPerBeat,
      })}
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const beat = Math.max(
          0,
          (event.clientX - rect.left) / pixelsPerBeat + viewportStartBeat,
        );
        onSeek(beatsToSeconds(beat, tempo));
      }}
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
                audioDuration: take.duration,
                audioOffset,
                variant: "comp",
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
      {takes.map((take) => (
        <TimelineClip
          key={take.id}
          clip={{
            label: `Take ${take.number}`,
            duration: take.trimEnd - take.trimStart,
            offset: take.timelineOffset + take.trimStart,
            variant: "take",
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
      style={getTimelineGridStyle({
        beatsPerBar,
        pixelsPerBeat,
        viewportStartBeat,
        subdivisionsPerBeat,
      })}
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const beat = Math.max(
          0,
          (event.clientX - rect.left) / pixelsPerBeat + viewportStartBeat,
        );
        onSeek(beatsToSeconds(beat, tempo));
      }}
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
  const hidePresentation = clip.variant === "take";
  const clipClass = recording
    ? "bg-red-400/20 text-red-100"
    : "bg-emerald-400/20 text-emerald-100";
  const clipBorderClass = recording
    ? "border-red-400/70"
    : "border-emerald-400/60";
  const clipStartBeat = secondsToBeats(clip.offset, tempo);
  const clipWidth = Math.max(
    2,
    secondsToBeats(clip.duration, tempo) * pixelsPerBeat,
  );
  const visibleStart = Math.max(
    0,
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
      data-testid={`recorder-clip-${recording ? "recording" : clip.variant}`}
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
                audioDuration={clip.audioDuration ?? clip.duration}
                rangeStart={clip.audioOffset ?? 0}
                rangeEnd={(clip.audioOffset ?? 0) + clip.duration}
                visibleStart={visibleStart}
                visibleEnd={visibleEnd}
                pixelWidth={clipWidth}
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
