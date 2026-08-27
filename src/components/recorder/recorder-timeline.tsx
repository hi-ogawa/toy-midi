import { LoaderCircleIcon, PlusIcon, UploadIcon } from "lucide-react";
import { useState } from "react";
import { usePointerDrag } from "../../hooks/use-pointer-drag";
import { usePointerGesture } from "../../hooks/use-pointer-gesture";
import { AudioView } from "../../lib/audio-view";
import type { RecorderRuntimeState } from "../../lib/recorder/runtime";
import { deriveTakeRegions } from "../../lib/recorder/take-regions";
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
  variant: "audio" | "take" | "recording";
  audioView?: AudioView;
};

const TIMELINE_EPSILON = 1e-6;

export function TakeTimelineLane({
  takes,
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
  const takeById = new Map(takes.map((take) => [take.id, take]));
  const regions = deriveTakeRegions(takes);

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
          const take = takeById.get(region.takeId)!;
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
              key={`${region.takeId}:${index}`}
              clip={{
                label: `Take ${take.number}`,
                duration: region.timelineEnd - region.timelineStart,
                offset: region.timelineStart,
                audioDuration: take.duration,
                audioOffset,
                variant: "take",
                audioView: take.audioView,
              }}
              pixelsPerBeat={pixelsPerBeat}
              viewportStartBeat={viewportStartBeat}
              tempo={tempo}
              viewportWidth={viewportWidth}
              testId="recorder-comp-region"
              joinsPrevious={joinsPrevious}
              joinsNext={joinsNext}
            />
          );
        })}
      </div>
      <div className="absolute inset-0">
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
            interactionOnly
          />
        ))}
      </div>
      {pendingRecording && (
        <div>
          <TimelineClip
            clip={{
              duration: pendingRecording.duration,
              label:
                captureStatus === "processing"
                  ? "Finalizing..."
                  : "Recording...",
              offset: pendingRecording.timelineOffset,
              variant: "recording",
            }}
            pixelsPerBeat={pixelsPerBeat}
            viewportStartBeat={viewportStartBeat}
            tempo={tempo}
            viewportWidth={viewportWidth}
          />
        </div>
      )}
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
  interactionOnly = false,
  joinsPrevious = false,
  joinsNext = false,
  testId,
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
  interactionOnly?: boolean;
  joinsPrevious?: boolean;
  joinsNext?: boolean;
  testId?: string;
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
  const clipClass = {
    audio: "border-emerald-400/60 bg-emerald-400/20 text-emerald-100",
    take: "border-emerald-400/60 bg-emerald-400/20 text-emerald-100",
    recording: "border-red-400/70 bg-red-400/20 text-red-100",
  }[clip.variant];
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
      aria-label={interactionOnly ? clip.label : undefined}
      data-testid={testId ?? `recorder-clip-${clip.variant}`}
      data-selected={selected ? "true" : undefined}
      ref={onClipDragMove ? dragRef : undefined}
      className={cn(
        "absolute inset-y-1 rounded-sm border text-[11px]",
        interactionOnly
          ? "border-transparent bg-transparent text-transparent"
          : clipClass,
        onClipDragMove && "cursor-ew-resize select-none",
        onClipDragStart && "cursor-pointer",
        joinsPrevious && "rounded-l-none",
        joinsNext && "rounded-r-none border-r-0",
        selected && "border-sky-300 ring-1 ring-inset ring-sky-300",
        isDragging &&
          (interactionOnly
            ? "border-sky-300 ring-1 ring-inset ring-sky-300"
            : "brightness-125"),
      )}
      style={{
        left: (clipStartBeat - viewportStartBeat) * pixelsPerBeat,
        width: clipWidth,
      }}
    >
      {!interactionOnly && (
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
