import { useMutation } from "@tanstack/react-query";
import {
  MoreVerticalIcon,
  Music2Icon,
  FileMusicIcon,
  Settings2Icon,
  Trash2Icon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
} from "react";
import { toast } from "sonner";
import { usePointerGesture } from "../../hooks/use-pointer-gesture";
import { useWindowEvent } from "../../hooks/use-window-event";
import { isBlackKey } from "../../lib/music";
import { formatChromaticPitch } from "../../lib/pitch-spelling";
import type {
  MidiTrackState,
  RecorderRuntime,
} from "../../lib/recorder/runtime";
import {
  getTabAnnotationDisplay,
  type TabAnnotationDisplay,
} from "../../lib/tab-annotation";
import { getTimelineGridBackground } from "../../lib/timeline-grid";
import { Button } from "../ui/button";
import { PortalDialog } from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../ui/utils";
import { MidiInstrument } from "./recorder-midi-instrument";
import { TrackRow } from "./recorder-tracks";
import {
  useRecorderMidiInteraction,
  type MidiBoxSelection,
} from "./use-recorder-midi-interaction";

const KEY_HEIGHT = 18;
const PITCHES = Array.from({ length: 128 }, (_, index) => 127 - index);

export function MidiTrackRow({
  track,
  runtime,
  pixelsPerBeat,
  beatsPerBar,
  subdivisionsPerBeat,
  viewportStartBeat,
  effectsOpen,
  onEffectsToggle,
  onRemove,
  midiInteraction,
  onTranscribe,
  onScorePreview,
}: {
  track: MidiTrackState;
  runtime: RecorderRuntime;
  pixelsPerBeat: number;
  beatsPerBar: number;
  subdivisionsPerBeat: number;
  viewportStartBeat: number;
  effectsOpen: boolean;
  onEffectsToggle: () => void;
  onRemove: () => void;
  midiInteraction: ReturnType<typeof useRecorderMidiInteraction>;
  onTranscribe: () => void;
  onScorePreview: () => void;
}) {
  const [isInstrumentOpen, setIsInstrumentOpen] = useState(false);
  return (
    <div onFocus={midiInteraction.activate}>
      <TrackRow
        data-testid="recorder-midi-track-row"
        // Keep controls at their content height so the piano keyboard shows below.
        controlsClassName="h-fit"
        title={track.name}
        height={track.height}
        gain={track.gain}
        muted={track.muted}
        soloed={track.soloed}
        effectsOpen={effectsOpen}
        onEffectsToggle={onEffectsToggle}
        onGainChange={(gain) => runtime.setTrackMix(track.id, { gain })}
        onMutedChange={(muted) => runtime.setTrackMix(track.id, { muted })}
        onSoloedChange={(soloed) => runtime.setTrackMix(track.id, { soloed })}
        onHeightChange={(height) => runtime.setTrackHeight(track.id, height)}
        action={
          <MidiTrackActions
            label={track.name}
            onRemove={onRemove}
            onTranscribe={onTranscribe}
            onScorePreview={onScorePreview}
            onInstrumentOpen={() => setIsInstrumentOpen(true)}
          />
        }
      >
        <MidiTrackEditor
          track={track}
          runtime={runtime}
          midiInteraction={midiInteraction}
          pixelsPerBeat={pixelsPerBeat}
          beatsPerBar={beatsPerBar}
          subdivisionsPerBeat={subdivisionsPerBeat}
          viewportStartBeat={viewportStartBeat}
        />
      </TrackRow>
      <PortalDialog
        isOpen={isInstrumentOpen}
        title={`${track.name} instrument`}
        onClose={() => setIsInstrumentOpen(false)}
      >
        <MidiInstrument track={track} runtime={runtime} />
      </PortalDialog>
    </div>
  );
}

function MidiTrackActions({
  label,
  onRemove,
  onInstrumentOpen,
  onTranscribe,
  onScorePreview,
}: {
  label: string;
  onRemove: () => void;
  onInstrumentOpen: () => void;
  onTranscribe: () => void;
  onScorePreview: () => void;
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
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={onInstrumentOpen}>
          <Settings2Icon />
          Instrument…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onScorePreview}>
          <FileMusicIcon />
          Score preview
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onTranscribe}>
          <Music2Icon />
          Audio to MIDI
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

function MidiTrackEditor({
  track,
  runtime,
  midiInteraction,
  pixelsPerBeat,
  beatsPerBar,
  subdivisionsPerBeat,
  viewportStartBeat,
}: {
  track: MidiTrackState;
  runtime: RecorderRuntime;
  midiInteraction: ReturnType<typeof useRecorderMidiInteraction>;
  pixelsPerBeat: number;
  beatsPerBar: number;
  subdivisionsPerBeat: number;
  viewportStartBeat: number;
}) {
  const preview = useMidiNotePreview({ runtime, trackId: track.id });
  const [initialPitch] = useState(() => track.notes[0]?.pitch ?? 60);
  const boxSelection = midiInteraction.getBoxSelectionPreview(track.id);
  const hasSelection = midiInteraction.hasTrackSelection(track.id);

  useWindowEvent("blur", midiInteraction.cancelEdit);

  // Stop auditioning when the selected note is cleared or removed.
  useEffect(() => {
    if (!hasSelection) {
      preview.stop();
    }
  }, [hasSelection]);

  const scrollRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) {
        return;
      }
      // Center the initial pitch when the scroll container mounts.
      element.scrollTop =
        (127 - initialPitch) * KEY_HEIGHT - element.clientHeight / 2;

      // Keep native vertical pitch scrolling local. Let horizontal gestures,
      // Shift+wheel, and Ctrl+wheel reach the timeline for navigation and zoom.
      const handleWheel = (event: WheelEvent) => {
        if (!event.ctrlKey && !event.shiftKey && event.deltaX === 0) {
          event.stopPropagation();
        }
      };
      element.addEventListener("wheel", handleWheel);
      return () => element.removeEventListener("wheel", handleWheel);
    },
    [initialPitch],
  );

  function getPointerPosition(event: PointerEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return {
      pitch: 127 - (event.clientY - rect.top) / KEY_HEIGHT,
      beat: viewportStartBeat + (event.clientX - rect.left) / pixelsPerBeat,
    };
  }

  type MidiGridGesture =
    | { type: "select"; noteId: string }
    | { type: "edit" }
    | { type: "box-select" }
    | { type: "create" };

  const gridRef = usePointerGesture<MidiGridGesture>({
    onStart: (event) => {
      // Focus the grid and select an existing note, or create one in an empty cell.
      event.preventDefault();
      (event.currentTarget as HTMLElement).focus({ preventScroll: true });
      const target = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-note-id]",
      );
      const existing = track.notes.find(
        (note) => note.id === target?.dataset.noteId,
      );
      const position = getPointerPosition(event);
      if (existing) {
        if (event.ctrlKey || event.metaKey) {
          preview.start(existing.pitch);
          return { type: "select", noteId: existing.id };
        }
        const edge = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-note-edge]",
        )?.dataset.noteEdge;
        const mode =
          edge === "start"
            ? "resize-start"
            : edge === "end"
              ? "resize-end"
              : "move";
        midiInteraction.startEdit({
          trackId: track.id,
          noteId: existing.id,
          mode,
          beat: position.beat,
        });
        preview.start(existing.pitch);
        return { type: "edit" };
      }
      if (event.shiftKey) {
        midiInteraction.startBoxSelection({ trackId: track.id, position });
        return { type: "box-select" };
      }
      const note = midiInteraction.create({ trackId: track.id, ...position });
      if (note) {
        preview.start(note.pitch);
      }
      return { type: "create" };
    },
    onClick: (event, gesture) => {
      if (gesture.data.type === "select") {
        midiInteraction.select({
          trackId: track.id,
          noteId: gesture.data.noteId,
          additive: true,
        });
      } else if (gesture.data.type === "box-select") {
        midiInteraction.finishBoxSelection(getPointerPosition(event));
      } else {
        midiInteraction.cancelEdit();
      }
      preview.stop();
    },
    onDragMove: (event, gesture) => {
      if (gesture.data.type === "box-select") {
        midiInteraction.updateBoxSelection(getPointerPosition(event));
      } else if (gesture.data.type === "edit") {
        const note = midiInteraction.updateEdit(getPointerPosition(event));
        if (note) {
          preview.start(note.pitch);
        }
      }
    },
    onDragEnd: (event, gesture) => {
      const position = getPointerPosition(event);
      if (gesture.data.type === "box-select") {
        midiInteraction.finishBoxSelection(position);
      } else if (gesture.data.type === "edit") {
        midiInteraction.finishEdit(position);
      }
      preview.stop();
    },
    onCancel: cancelEdit,
  });

  function cancelEdit() {
    midiInteraction.cancelEdit();
    preview.stop();
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      cancelEdit();
      if (hasSelection) {
        midiInteraction.clear();
      }
    }
  }

  return (
    <div
      data-testid="recorder-midi-pitch-scroll"
      className="col-span-2 col-start-1 row-start-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain [scrollbar-width:thin] [scrollbar-color:#525252_transparent]"
      ref={scrollRef}
      onBlur={handleBlur}
    >
      <div
        className="grid grid-cols-[15rem_minmax(0,1fr)]"
        style={{ height: 128 * KEY_HEIGHT }}
      >
        <div className="relative border-r border-neutral-700 bg-neutral-900">
          {PITCHES.map((pitch) => (
            <MidiPianoKey
              key={pitch}
              pitch={pitch}
              onPreviewStart={preview.start}
              onPreviewStop={preview.stop}
            />
          ))}
        </div>
        <div
          data-testid="recorder-midi-grid"
          className="relative overflow-hidden outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-400"
          role="group"
          aria-label={`${track.name} notes`}
          tabIndex={0}
          ref={gridRef}
        >
          {PITCHES.map((pitch) => (
            <MidiGridRow key={pitch} pitch={pitch} />
          ))}
          <div
            className="pointer-events-none absolute inset-0"
            style={getTimelineGridBackground({
              beatsPerBar,
              pixelsPerBeat,
              viewportStartBeat,
              subdivisionsPerBeat,
              minimumPixelSpacing: 8,
              colors: {
                bar: "#525252",
                beat: "#404040",
                subdivision: "#333333",
              },
            })}
          />
          {track.notes.map((note) => {
            const displayedNote =
              midiInteraction.getEditPreview({
                trackId: track.id,
                noteId: note.id,
              }) ?? note;
            const annotation = track.tabAnnotationEnabled
              ? getTabAnnotationDisplay({
                  note: displayedNote,
                  openStringPitches: track.tabOpenStringPitches,
                })
              : undefined;
            return (
              <MidiNote
                key={note.id}
                note={displayedNote}
                annotation={annotation}
                selected={midiInteraction.isSelected(track.id, note.id)}
                pixelsPerBeat={pixelsPerBeat}
                viewportStartBeat={viewportStartBeat}
              />
            );
          })}
          {boxSelection && (
            <div
              data-testid="recorder-midi-box-selection"
              className="pointer-events-none absolute border border-blue-300 bg-blue-400/20"
              style={getMidiBoxSelectionRect({
                selection: boxSelection,
                viewportStartBeat,
                pixelsPerBeat,
              })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function getMidiBoxSelectionRect({
  selection: { start, current },
  viewportStartBeat,
  pixelsPerBeat,
}: {
  selection: MidiBoxSelection;
  viewportStartBeat: number;
  pixelsPerBeat: number;
}) {
  const firstBeat = Math.min(start.beat, current.beat);
  const lastBeat = Math.max(start.beat, current.beat);
  const lowestPitch = Math.min(start.pitch, current.pitch);
  const highestPitch = Math.max(start.pitch, current.pitch);

  // Continuous pitch coordinates run downward from 127.
  return {
    left: (firstBeat - viewportStartBeat) * pixelsPerBeat,
    top: (127 - highestPitch) * KEY_HEIGHT,
    width: (lastBeat - firstBeat) * pixelsPerBeat,
    height: (highestPitch - lowestPitch) * KEY_HEIGHT,
  };
}

function useMidiNotePreview({
  runtime,
  trackId,
}: {
  runtime: RecorderRuntime;
  trackId: string;
}) {
  const previewPitch = useRef<number>(undefined);

  const previewMutation = useMutation({
    mutationFn: (pitch: number) =>
      runtime.startMidiNotePreview({ id: trackId, pitch }),
    onError: (error) => {
      stop();
      console.error(error);
      toast.error(error.message);
    },
  });

  function start(pitch: number) {
    // Keep the note sounding during horizontal or in-cell dragging.
    // Audition again only when the pitch changes.
    if (previewPitch.current === pitch) {
      return;
    }
    stop();
    previewPitch.current = pitch;
    previewMutation.mutate(pitch);
  }

  function stop() {
    if (previewPitch.current !== undefined) {
      runtime.stopMidiNotePreview({
        id: trackId,
        pitch: previewPitch.current,
      });
      previewPitch.current = undefined;
    }
  }

  // Pointer capture handles release and cancellation. Also stop when the app loses focus.
  useWindowEvent("blur", stop);

  // Stop a held note if the editor unmounts or switches to another track/runtime.
  useEffect(() => () => stop(), [runtime, trackId]);

  return { start, stop };
}

function MidiPianoKey({
  pitch,
  onPreviewStart,
  onPreviewStop,
}: {
  pitch: number;
  onPreviewStart: (pitch: number) => void;
  onPreviewStop: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Preview ${formatChromaticPitch(pitch)}`}
      className={cn(
        "absolute right-0 w-[50px] cursor-pointer border-b pr-2 text-right text-xs hover:brightness-110",
        isBlackKey(pitch)
          ? "border-neutral-700 bg-neutral-800"
          : cn(
              "bg-neutral-300 text-neutral-600",
              pitch % 12 === 0 || pitch % 12 === 5
                ? "border-neutral-500"
                : "border-neutral-400",
            ),
      )}
      style={{
        top: (127 - pitch) * KEY_HEIGHT,
        height: KEY_HEIGHT,
      }}
      onPointerDown={(event) => {
        if (event.button === 0) {
          event.currentTarget.setPointerCapture(event.pointerId);
          onPreviewStart(pitch);
        }
      }}
      onLostPointerCapture={onPreviewStop}
    >
      {pitch % 12 === 0 ? formatChromaticPitch(pitch) : ""}
    </button>
  );
}

function MidiGridRow({ pitch }: { pitch: number }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 border-t",
        pitch % 12 === 11 ? "border-[#666666]" : "border-[#333333]",
        isBlackKey(pitch) ? "bg-[#111111]" : "bg-[#1a1a1a]",
      )}
      style={{
        top: (127 - pitch) * KEY_HEIGHT,
        height: KEY_HEIGHT,
      }}
    />
  );
}

function MidiNote({
  note,
  annotation,
  selected,
  pixelsPerBeat,
  viewportStartBeat,
}: {
  note: MidiTrackState["notes"][number];
  selected: boolean;
  annotation?: TabAnnotationDisplay;
  pixelsPerBeat: number;
  viewportStartBeat: number;
}) {
  return (
    <div
      data-note-id={note.id}
      data-selected={selected}
      aria-label={`${formatChromaticPitch(note.pitch)}, beat ${note.start + 1}`}
      className={cn(
        "absolute cursor-grab active:cursor-grabbing rounded-sm border border-[#2563eb]",
        selected
          ? "bg-[#60a5fa] outline-2 -outline-offset-2 outline-[#dbeafe]"
          : "bg-[#3b82f6]",
      )}
      style={{
        backgroundColor: annotation?.color.background,
        borderColor: annotation?.color.border,
        left: (note.start - viewportStartBeat) * pixelsPerBeat,
        top: (127 - note.pitch) * KEY_HEIGHT + 1,
        width: Math.max(2, note.duration * pixelsPerBeat),
        height: KEY_HEIGHT - 2,
      }}
    >
      {annotation && (
        <span
          data-testid="tab-annotation"
          className="absolute inset-0 flex items-center justify-center overflow-hidden font-mono font-semibold leading-none pointer-events-none"
          style={{
            fontSize: Math.max(7, Math.min(14, KEY_HEIGHT * 0.55)),
            color: annotation.color.text,
          }}
        >
          {annotation.label}
        </span>
      )}
      <div
        data-note-edge="start"
        className="absolute inset-y-0 left-0 w-1/4 max-w-1.5 cursor-ew-resize"
        title="Resize note start"
      />
      <div
        data-note-edge="end"
        className="absolute inset-y-0 right-0 w-1/4 max-w-1.5 cursor-ew-resize"
        title="Resize note end"
      />
    </div>
  );
}
