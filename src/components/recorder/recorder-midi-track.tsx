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
  type PointerEvent,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { useWindowEvent } from "../../hooks/use-window-event";
import {
  isShortcutTextInputTarget,
  matchKeyboardEvent,
} from "../../lib/keyboard";
import { isBlackKey, clampPitch, snapToGrid } from "../../lib/music";
import { formatChromaticPitch } from "../../lib/pitch-spelling";
import type {
  MidiTrackState,
  RecorderRuntime,
  RecorderRuntimeState,
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
import { RecorderAudioToMidi } from "./recorder-audio-to-midi";
import { TrackRow } from "./recorder-tracks";

const KEY_HEIGHT = 18;
const PITCHES = Array.from({ length: 128 }, (_, index) => 127 - index);

export function MidiTrackRow({
  state,
  track,
  runtime,
  pixelsPerBeat,
  beatsPerBar,
  subdivisionsPerBeat,
  viewportStartBeat,
  effectsOpen,
  onEffectsToggle,
  onRemove,
  onFocus,
}: {
  state: RecorderRuntimeState;
  track: MidiTrackState;
  runtime: RecorderRuntime;
  pixelsPerBeat: number;
  beatsPerBar: number;
  subdivisionsPerBeat: number;
  viewportStartBeat: number;
  effectsOpen: boolean;
  onEffectsToggle: () => void;
  onRemove: () => void;
  onFocus: () => void;
}) {
  const [isTranscribeOpen, setIsTranscribeOpen] = useState(false);
  const [isProgramOpen, setIsProgramOpen] = useState(false);
  const programMutation = useMutation({
    mutationFn: (program: number) =>
      runtime.setMidiTrackProgram(track.id, program),
  });
  return (
    <div onFocus={onFocus}>
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
            onTranscribe={() => setIsTranscribeOpen(true)}
            onProgramSelect={() => setIsProgramOpen(true)}
          />
        }
      >
        <MidiTrackEditor
          track={track}
          runtime={runtime}
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
      {isTranscribeOpen && (
        <RecorderAudioToMidi
          runtime={runtime}
          state={state}
          track={track}
          cellsPerBeat={subdivisionsPerBeat}
          onClose={() => setIsTranscribeOpen(false)}
        />
      )}
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
      <DropdownMenuContent align="end">
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
  pixelsPerBeat,
  beatsPerBar,
  subdivisionsPerBeat,
  viewportStartBeat,
}: {
  track: MidiTrackState;
  runtime: RecorderRuntime;
  pixelsPerBeat: number;
  beatsPerBar: number;
  subdivisionsPerBeat: number;
  viewportStartBeat: number;
}) {
  const previewPitch = useRef<number | undefined>(undefined);
  const [initialPitch] = useState(() => track.notes[0]?.pitch ?? 60);
  const [selectedId, setSelectedId] = useState<string>();
  const selected = track.notes.find((note) => note.id === selectedId);

  function stopPreview() {
    if (previewPitch.current !== undefined) {
      runtime.stopMidiNotePreview({
        id: track.id,
        pitch: previewPitch.current,
      });
      previewPitch.current = undefined;
    }
  }

  const previewMutation = useMutation({
    mutationFn: (pitch: number) =>
      runtime.startMidiNotePreview({ id: track.id, pitch }),
  });

  function startPreview(pitch: number) {
    stopPreview();
    previewPitch.current = pitch;
    previewMutation.mutate(pitch, { onError: stopPreview });
  }

  // Pointer capture handles release and cancellation. Also stop when the app loses focus.
  useWindowEvent("blur", stopPreview);

  // Stop a held note if the editor unmounts or switches to another track/runtime.
  useEffect(
    () => () => {
      if (previewPitch.current !== undefined) {
        runtime.stopMidiNotePreview({
          id: track.id,
          pitch: previewPitch.current,
        });
      }
    },
    [runtime, track.id],
  );

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

  function deleteSelected() {
    if (!selected) {
      return;
    }
    stopPreview();
    runtime.setMidiTrackNotes(
      track.id,
      track.notes.filter((note) => note.id !== selected.id),
    );
    setSelectedId(undefined);
  }

  function handleGridPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }
    // Capture the pointer for preview release and focus the grid for shortcuts.
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });

    // Select and preview an existing note when clicked.
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-note-id]",
    );
    const existing = track.notes.find(
      (note) => note.id === target?.dataset.noteId,
    );
    if (existing) {
      setSelectedId(existing.id);
      startPreview(existing.pitch);
      return;
    }

    // Convert an empty-grid click to a pitch and beat.
    const rect = event.currentTarget.getBoundingClientRect();
    const pitch = clampPitch(
      127 - Math.floor((event.clientY - rect.top) / KEY_HEIGHT),
    );
    const beat =
      viewportStartBeat + (event.clientX - rect.left) / pixelsPerBeat;

    // Add a note snapped down to the grid, then select and preview it.
    const note = {
      id: crypto.randomUUID(),
      pitch,
      start: Math.max(
        0,
        snapToGrid(beat, 1 / subdivisionsPerBeat, {
          floor: true,
        }),
      ),
      duration: 1 / subdivisionsPerBeat,
      velocity: 100,
    };
    runtime.setMidiTrackNotes(track.id, [...track.notes, note]);
    setSelectedId(note.id);
    startPreview(pitch);
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      stopPreview();
      setSelectedId(undefined);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (isShortcutTextInputTarget(event.target)) {
      return;
    }
    if (
      matchKeyboardEvent(event, "Delete") ||
      matchKeyboardEvent(event, "Backspace")
    ) {
      event.preventDefault();
      event.stopPropagation();
      deleteSelected();
    } else if (matchKeyboardEvent(event, "Escape")) {
      event.stopPropagation();
      setSelectedId(undefined);
    }
  }

  return (
    <div
      data-testid="recorder-midi-pitch-scroll"
      className="col-span-2 col-start-1 row-start-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain"
      ref={scrollRef}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
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
              onPreviewStart={startPreview}
              onPreviewStop={stopPreview}
            />
          ))}
        </div>
        <div
          data-testid="recorder-midi-grid"
          className="relative overflow-hidden outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-400"
          role="group"
          aria-label={`${track.name} notes`}
          tabIndex={0}
          onPointerDown={handleGridPointerDown}
          onLostPointerCapture={stopPreview}
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
              note={note}
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
        "absolute cursor-pointer rounded-sm border border-[#2563eb]",
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
