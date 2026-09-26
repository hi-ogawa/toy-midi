import { useMutation } from "@tanstack/react-query";
import {
  DownloadIcon,
  UploadIcon,
  Music2Icon,
  FileMusicIcon,
  Settings2Icon,
  Trash2Icon,
  SlidersHorizontalIcon,
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
import { buildExportFileName, downloadBlob } from "../../lib/export-utils";
import { exportMidi } from "../../lib/midi-export";
import { importMidiNotes, parseMidiFile } from "../../lib/midi-import";
import { isBlackKey, MAX_PITCH } from "../../lib/music";
import { exportMusicXml } from "../../lib/musicxml/render";
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
import type { Note } from "../../types";
import { pluralCount } from "../../utils/plural-count";
import { openFilePicker } from "../file-drop-input";
import { Dialog } from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../ui/utils";
import { MidiInstrument } from "./recorder-midi-instrument";
import {
  TrackMenuButton,
  type TrackMoveControls,
  TrackMoveItems,
  RenameTrackMenuItem,
  TrackRow,
} from "./recorder-tracks";
import {
  useRecorderMidiInteraction,
  getMidiGridPosition,
  getMidiBoxSelectionRect,
} from "./use-recorder-midi-interaction";

const KEY_HEIGHT = 18;
const PITCHES = Array.from(
  { length: MAX_PITCH + 1 },
  (_, index) => MAX_PITCH - index,
);

export function MidiTrackRow({
  track,
  runtime,
  pixelsPerBeat,
  beatsPerBar,
  subdivisionsPerBeat,
  viewportStartBeat,
  move,
  onEffectsOpen,
  onRemove,
  midiInteraction,
  onTranscribe,
  onScorePreview,
  onProgramSelected,
}: {
  track: MidiTrackState;
  runtime: RecorderRuntime;
  pixelsPerBeat: number;
  beatsPerBar: number;
  subdivisionsPerBeat: number;
  viewportStartBeat: number;
  move: TrackMoveControls;
  onEffectsOpen: () => void;
  onRemove: () => void;
  midiInteraction: ReturnType<typeof useRecorderMidiInteraction>;
  onTranscribe: () => void;
  onScorePreview: () => void;
  onProgramSelected: (program: number) => void;
}) {
  const [isInstrumentOpen, setIsInstrumentOpen] = useState(false);
  const programMutation = useMutation({
    mutationFn: (program: number) =>
      runtime.setMidiTrackProgram(track.id, program),
    onSuccess: (_data, program) => onProgramSelected(program),
  });
  const importMidiMutation = useMutation({
    mutationFn: async (file: File) => {
      const parsed = await parseMidiFile(file);
      const { notes } = await importMidiNotes(file, {
        trackIndices: parsed.tracks.map((source) => source.index),
        replaceExisting: true,
        importTempo: false,
        importTimeSignature: false,
      });
      runtime.setMidiTrackNotes(track.id, notes);
      return notes.length;
    },
    onSuccess: (count) =>
      toast.success(`Imported ${count} notes from MIDI file`),
    onError: (error) => {
      console.error(error);
      toast.error("Failed to import MIDI file");
    },
  });
  const exportMidiMutation = useMutation({
    mutationFn: async () => {
      const state = runtime.store.get();
      const data = exportMidi({
        notes: track.notes,
        tempo: state.tempo,
        timeSignature: state.timeSignature,
        name: state.title,
        trackName: track.name,
      });
      downloadBlob(
        new Blob([new Uint8Array(data)], { type: "audio/midi" }),
        buildExportFileName({
          baseName: `${state.title}-${track.name}`,
          extension: "mid",
        }),
      );
    },
  });
  const exportMusicXmlMutation = useMutation({
    mutationFn: async () => {
      const state = runtime.store.get();
      const xml = exportMusicXml({
        notes: track.notes,
        title: state.title,
        tempo: state.tempo,
        timeSignature: state.timeSignature,
        keySignature: track.keySignature,
        openStringPitches: track.tabOpenStringPitches,
        locators: state.locators.map(({ id, beat, label }) => ({
          id,
          position: beat,
          label,
        })),
      });
      downloadBlob(
        new Blob([xml], { type: "application/vnd.recordare.musicxml+xml" }),
        buildExportFileName({
          baseName: `${state.title}-${track.name}`,
          extension: "musicxml",
        }),
      );
    },
    onError: (error) => {
      console.error(error);
      toast.error(error.message);
    },
  });

  return (
    <div onFocus={midiInteraction.activate}>
      <TrackRow
        data-testid="recorder-midi-track-row"
        // Anchor the keyboard’s top edge to the controls so pitch scrolling keeps it visible.
        controlsClassName={
          track.viewMode === "editor"
            ? "after:pointer-events-none after:absolute after:top-full after:right-0 after:w-[50px] after:border-t after:border-neutral-600"
            : undefined
        }
        title={track.name}
        height={track.height}
        gain={track.gain}
        muted={track.muted}
        soloed={track.soloed}
        onGainChange={(gain) => runtime.setTrackMix(track.id, { gain })}
        onMutedChange={(muted) => runtime.setTrackMix(track.id, { muted })}
        onSoloedChange={(soloed) => runtime.setTrackMix(track.id, { soloed })}
        onHeightChange={(height) => runtime.setTrackHeight(track.id, height)}
        action={
          <MidiTrackActions
            label={track.name}
            move={move}
            onRename={(name) => runtime.setTrackName({ id: track.id, name })}
            onEffectsOpen={onEffectsOpen}
            viewMode={track.viewMode}
            onViewModeToggle={() => midiInteraction.toggleViewMode(track.id)}
            onRemove={onRemove}
            onTranscribe={onTranscribe}
            onScorePreview={onScorePreview}
            onInstrumentOpen={() => setIsInstrumentOpen(true)}
            isImporting={importMidiMutation.isPending}
            onImportMidi={() =>
              openFilePicker({
                accept: ".mid,.midi",
                onFile: (file) => {
                  if (
                    confirm(
                      `Import MIDI into ${track.name}? This will replace all notes in this track. Project tempo, time signature, and instrument will stay unchanged.`,
                    )
                  ) {
                    importMidiMutation.mutate(file);
                  }
                },
              })
            }
            onExportMidi={() => exportMidiMutation.mutate()}
            onExportMusicXml={() => exportMusicXmlMutation.mutate()}
          />
        }
      >
        {track.viewMode === "overview" ? (
          <MidiTrackOverview
            track={track}
            pixelsPerBeat={pixelsPerBeat}
            beatsPerBar={beatsPerBar}
            viewportStartBeat={viewportStartBeat}
          />
        ) : (
          <MidiTrackEditor
            track={track}
            runtime={runtime}
            midiInteraction={midiInteraction}
            pixelsPerBeat={pixelsPerBeat}
            beatsPerBar={beatsPerBar}
            subdivisionsPerBeat={subdivisionsPerBeat}
            viewportStartBeat={viewportStartBeat}
          />
        )}
        {track.notes.length === 0 && (
          <div className="pointer-events-none z-10 col-start-2 row-start-1 grid place-items-center text-xs text-neutral-600">
            {track.viewMode === "overview"
              ? "No notes"
              : "Click the grid to add notes"}
          </div>
        )}
      </TrackRow>
      <Dialog
        data-testid="recorder-midi-instrument"
        isOpen={isInstrumentOpen}
        title={`${track.name} instrument`}
        onClose={() => setIsInstrumentOpen(false)}
      >
        <MidiInstrument
          track={track}
          programPending={programMutation.isPending}
          onProgramChange={(program) => programMutation.mutate(program)}
          onSettingsChange={(settings) =>
            runtime.setMidiTrackSettings(track.id, settings)
          }
        />
      </Dialog>
    </div>
  );
}

function MidiTrackActions({
  onRename,
  onEffectsOpen,
  isImporting,
  onImportMidi,
  onExportMidi,
  onExportMusicXml,
  label,
  viewMode,
  onViewModeToggle,
  move,
  onRemove,
  onInstrumentOpen,
  onTranscribe,
  onScorePreview,
}: {
  onRename: (name: string) => void;
  onEffectsOpen: () => void;
  isImporting: boolean;
  onImportMidi: () => void;
  onExportMidi: () => void;
  onExportMusicXml: () => void;
  label: string;
  viewMode: MidiTrackState["viewMode"];
  onViewModeToggle: () => void;
  move: TrackMoveControls;
  onRemove: () => void;
  onInstrumentOpen: () => void;
  onTranscribe: () => void;
  onScorePreview: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <TrackMenuButton label={label} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <RenameTrackMenuItem name={label} onRename={onRename} />
        <DropdownMenuCheckboxItem
          checked={viewMode === "overview"}
          onCheckedChange={onViewModeToggle}
          onSelect={(event) => event.preventDefault()}
        >
          Overview
        </DropdownMenuCheckboxItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onEffectsOpen}>
          <SlidersHorizontalIcon />
          Effects…
        </DropdownMenuItem>
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
        <DropdownMenuItem onSelect={onImportMidi} disabled={isImporting}>
          <UploadIcon />
          {isImporting ? "Importing MIDI…" : "Import MIDI…"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onExportMidi}>
          <DownloadIcon />
          Export MIDI
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onExportMusicXml}>
          <DownloadIcon />
          Export MusicXML
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <TrackMoveItems {...move} />
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onRemove} className="text-red-400">
          <Trash2Icon />
          Remove track
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MidiTrackOverview({
  track,
  pixelsPerBeat,
  beatsPerBar,
  viewportStartBeat,
}: {
  track: MidiTrackState;
  pixelsPerBeat: number;
  beatsPerBar: number;
  viewportStartBeat: number;
}) {
  return (
    <div
      data-testid="recorder-midi-overview"
      role="img"
      aria-label={`${track.name} note overview, ${pluralCount(track.notes.length, "note")}`}
      className="relative col-start-2 row-start-1 overflow-hidden bg-neutral-900"
      style={getTimelineGridBackground({
        beatsPerBar,
        pixelsPerBeat,
        viewportStartBeat,
        subdivisionsPerBeat: 1,
        minimumPixelSpacing: 8,
        colors: { bar: "#525252", beat: "#333333", subdivision: "#333333" },
      })}
    >
      {track.notes.length > 0 && (
        <MidiTrackOverviewNotes
          notes={track.notes}
          pixelsPerBeat={pixelsPerBeat}
          viewportStartBeat={viewportStartBeat}
        />
      )}
    </div>
  );
}

function MidiTrackOverviewNotes({
  notes,
  pixelsPerBeat,
  viewportStartBeat,
}: {
  notes: Note[];
  pixelsPerBeat: number;
  viewportStartBeat: number;
}) {
  const OVERVIEW_NOTE_HEIGHT = 4;
  const OVERVIEW_PITCH_PADDING = 12;
  const { min, max } = getMidiOverviewPitchDomain(notes);
  const octavePitches = getMidiOctavePitches(min, max);

  function pitchToPercent(pitch: number) {
    return ((max - pitch) / (max - min)) * 100;
  }

  function getNoteStyle(note: Note) {
    return {
      left: (note.start - viewportStartBeat) * pixelsPerBeat,
      top: `${pitchToPercent(note.pitch)}%`,
      width: Math.max(2, note.duration * pixelsPerBeat),
      height: OVERVIEW_NOTE_HEIGHT,
    };
  }

  return (
    <div
      className="absolute inset-x-0"
      style={{
        top: OVERVIEW_PITCH_PADDING,
        height: `calc(100% - ${OVERVIEW_PITCH_PADDING * 2 + OVERVIEW_NOTE_HEIGHT}px)`,
      }}
    >
      {octavePitches.map((pitch) => (
        <div
          key={pitch}
          data-testid="recorder-midi-octave-guide"
          data-pitch={pitch}
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 border-t border-neutral-600/60"
          style={{
            top: `calc(${pitchToPercent(pitch)}% + ${OVERVIEW_NOTE_HEIGHT}px)`,
          }}
        >
          <span className="absolute left-1 -translate-y-1/2 bg-neutral-900 px-0.5 text-[9px] leading-none text-neutral-500">
            {formatChromaticPitch(pitch)}
          </span>
        </div>
      ))}
      {notes.map((note) => (
        <div
          key={note.id}
          className="pointer-events-none absolute rounded-sm bg-blue-400/70"
          style={getNoteStyle(note)}
        />
      ))}
    </div>
  );
}

function getMidiOverviewPitchDomain(notes: Note[]) {
  let noteMin = notes[0]!.pitch;
  let noteMax = noteMin;
  for (const note of notes) {
    noteMin = Math.min(noteMin, note.pitch);
    noteMax = Math.max(noteMax, note.pitch);
  }
  // Include the C octave around the note center so at least two octave guides
  // are visible. Ranges that already contain two Cs stay unchanged.
  const center = (noteMin + noteMax) / 2;
  const octaveMin = Math.floor(center / 12) * 12;
  const min = Math.min(noteMin, octaveMin);
  const max = Math.max(noteMax, octaveMin + 12);
  return { min, max };
}

function getMidiOctavePitches(min: number, max: number) {
  min = Math.max(0, Math.ceil(min / 12) * 12);
  max = Math.min(max, MAX_PITCH);
  const pitches: number[] = [];
  for (let pitch = min; pitch <= max; pitch += 12) {
    pitches.push(pitch);
  }
  return pitches;
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
        (MAX_PITCH - initialPitch) * KEY_HEIGHT - element.clientHeight / 2;

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
    return getMidiGridPosition({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      viewportStartBeat,
      pixelsPerBeat,
      pixelsPerKey: KEY_HEIGHT,
    });
  }

  type MidiGridGesture =
    | { type: "select"; noteId: string }
    | { type: "duplicate"; noteId: string; beat: number }
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
          return midiInteraction.isSelected(track.id, existing.id)
            ? { type: "duplicate", noteId: existing.id, beat: position.beat }
            : { type: "select", noteId: existing.id };
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
      if (gesture.data.type === "select" || gesture.data.type === "duplicate") {
        // Ctrl/Cmd-click toggles selection even on a selected note because
        // duplication starts only after crossing the drag threshold.
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
    onDragStart: (event, gesture) => {
      if (gesture.data.type === "duplicate") {
        const note = midiInteraction.startDuplicate({
          trackId: track.id,
          noteId: gesture.data.noteId,
          initialBeat: gesture.data.beat,
          position: getPointerPosition(event),
        });
        if (note) {
          preview.start(note.pitch);
        }
      }
    },
    onDragMove: (event, gesture) => {
      if (gesture.data.type === "box-select") {
        midiInteraction.updateBoxSelection(getPointerPosition(event));
      } else if (gesture.data.type === "edit") {
        const note = midiInteraction.updateEdit(getPointerPosition(event));
        if (note) {
          preview.start(note.pitch);
        }
      } else if (gesture.data.type === "duplicate") {
        const note = midiInteraction.updateDuplicate(getPointerPosition(event));
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
      } else if (gesture.data.type === "duplicate") {
        midiInteraction.finishDuplicate(position);
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
      className="col-span-2 col-start-1 row-start-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain scrollbar-thin"
      ref={scrollRef}
      onBlur={handleBlur}
    >
      <div
        className="grid grid-cols-[15rem_minmax(0,1fr)]"
        style={{ height: (MAX_PITCH + 1) * KEY_HEIGHT }}
      >
        <div className="relative border-r border-neutral-700">
          {PITCHES.map((pitch) => (
            <MidiPianoKey
              key={pitch}
              pitch={pitch}
              onPreviewStart={preview.start}
              onPreviewStop={preview.stop}
            />
          ))}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-[50px] border-l border-neutral-600"
          />
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
          {track.notes
            .concat(midiInteraction.getDuplicatePreviews(track.id))
            .map((note, index) => {
              const isDuplicate = index >= track.notes.length;
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
                  selected={
                    isDuplicate || midiInteraction.isSelected(track.id, note.id)
                  }
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
                pixelsPerKey: KEY_HEIGHT,
              })}
            />
          )}
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
          ? "border-neutral-700 bg-neutral-900"
          : cn(
              "bg-neutral-300 text-neutral-600",
              pitch % 12 === 0 || pitch % 12 === 5
                ? "border-neutral-500"
                : "border-neutral-400",
            ),
      )}
      style={{
        top: (MAX_PITCH - pitch) * KEY_HEIGHT,
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
        top: (MAX_PITCH - pitch) * KEY_HEIGHT,
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
        top: (MAX_PITCH - note.pitch) * KEY_HEIGHT + 1,
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
