import { useMutation } from "@tanstack/react-query";
import {
  MoreVerticalIcon,
  Music2Icon,
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
import { isBlackKey, clampPitch } from "../../lib/music";
import { formatChromaticPitch } from "../../lib/pitch-spelling";
import type {
  MidiTrackState,
  RecorderRuntime,
} from "../../lib/recorder/runtime";
import { getTimelineGridBackground } from "../../lib/timeline-grid";
import { InstrumentCombobox } from "../instrument-combobox";
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
import { TrackRow } from "./recorder-tracks";
import { useRecorderMidiInteraction } from "./use-recorder-midi-interaction";

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
}) {
  const [isProgramOpen, setIsProgramOpen] = useState(false);
  const programMutation = useMutation({
    mutationFn: (program: number) =>
      runtime.setMidiTrackProgram(track.id, program),
  });
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
            onProgramSelect={() => setIsProgramOpen(true)}
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
        isOpen={isProgramOpen}
        title={`${track.name} program`}
        onClose={() => setIsProgramOpen(false)}
      >
        <InstrumentCombobox
          aria-label={`${track.name} program`}
          value={track.program}
          disabled={programMutation.isPending}
          onValueChange={(program) => programMutation.mutate(program)}
        />
      </PortalDialog>
    </div>
  );
}

function MidiTrackActions({
  label,
  onRemove,
  onProgramSelect,
  onTranscribe,
}: {
  label: string;
  onRemove: () => void;
  onProgramSelect: () => void;
  onTranscribe: () => void;
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
        <DropdownMenuItem onSelect={onProgramSelect}>
          <Settings2Icon />
          Select program
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
  const selectedId = midiInteraction.getSelectedNoteId(track.id);

  useWindowEvent("blur", midiInteraction.cancelMove);

  // Stop auditioning when the selected note is cleared or removed.
  useEffect(() => {
    if (selectedId === undefined) {
      preview.stop();
    }
  }, [selectedId]);

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
      pitch: clampPitch(
        127 - Math.floor((event.clientY - rect.top) / KEY_HEIGHT),
      ),
      beat: viewportStartBeat + (event.clientX - rect.left) / pixelsPerBeat,
    };
  }

  const gridRef = usePointerGesture({
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
        midiInteraction.startMove({
          trackId: track.id,
          noteId: existing.id,
          beat: position.beat,
        });
        preview.start(existing.pitch);
        return;
      }
      midiInteraction.create({ trackId: track.id, ...position });
      preview.start(position.pitch);
    },
    onClick: cancelMove,
    onDragMove: (event) => {
      const note = midiInteraction.updateMove(getPointerPosition(event));
      if (note) {
        preview.start(note.pitch);
      }
    },
    onDragEnd: (event) => {
      midiInteraction.finishMove(getPointerPosition(event));
      preview.stop();
    },
    onCancel: cancelMove,
  });

  function cancelMove() {
    midiInteraction.cancelMove();
    preview.stop();
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      cancelMove();
      if (selectedId !== undefined) {
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
          {track.notes.map((note) => (
            <MidiNote
              key={note.id}
              note={
                midiInteraction.getMovePreview({
                  trackId: track.id,
                  noteId: note.id,
                }) ?? note
              }
              selected={selectedId === note.id}
              pixelsPerBeat={pixelsPerBeat}
              viewportStartBeat={viewportStartBeat}
            />
          ))}
        </div>
      </div>
    </div>
  );
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
  selected,
  pixelsPerBeat,
  viewportStartBeat,
}: {
  note: MidiTrackState["notes"][number];
  selected: boolean;
  pixelsPerBeat: number;
  viewportStartBeat: number;
}) {
  return (
    <div
      data-note-id={note.id}
      aria-label={`${formatChromaticPitch(note.pitch)}, beat ${note.start + 1}`}
      className={cn(
        "absolute cursor-grab active:cursor-grabbing rounded-sm border border-[#2563eb]",
        selected
          ? "bg-[#60a5fa] outline-2 -outline-offset-2 outline-[#dbeafe]"
          : "bg-[#3b82f6]",
      )}
      style={{
        left: (note.start - viewportStartBeat) * pixelsPerBeat,
        top: (127 - note.pitch) * KEY_HEIGHT + 1,
        width: Math.max(2, note.duration * pixelsPerBeat),
        height: KEY_HEIGHT - 2,
      }}
    />
  );
}
