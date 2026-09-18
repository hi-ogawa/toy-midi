import { useEffect, useState } from "react";
import { matchKeyboardEvent } from "../../lib/keyboard";
import { clamp, clampPitch, MAX_PITCH, snapToGrid } from "../../lib/music";
import type {
  RecorderRuntime,
  RecorderRuntimeState,
} from "../../lib/recorder/runtime";
import { moveTabString } from "../../lib/tab-annotation";
import type { Note } from "../../types";

type MidiNoteEdit = {
  trackId: string;
  original: Note;
  note: Note;
  getNote: GetNote;
};

// The pitch axis spans [0, MAX_PITCH + 1] upward. Note p occupies [p, p + 1).
type MidiGridPosition = { beat: number; pitch: number };
type GetNote = (position: MidiGridPosition) => Note;
type EditMode = "move" | "resize-start" | "resize-end";

type MidiBoxSelection = {
  start: MidiGridPosition;
  current: MidiGridPosition;
};

export function useRecorderMidiInteraction({
  runtime,
  state,
  subdivisionsPerBeat,
  onSelect,
}: {
  runtime: RecorderRuntime;
  state: RecorderRuntimeState;
  subdivisionsPerBeat: number;
  /** Only coordinates selection domains by clearing selection in the other domains. */
  onSelect: () => void;
}) {
  // A defined selection always contains at least one note ID.
  const [selection, setSelection] = useState<{
    trackId: string;
    noteIds: Set<string>;
  }>();
  const [edit, setEdit] = useState<MidiNoteEdit>();
  const [boxSelection, setBoxSelection] = useState<
    MidiBoxSelection & { trackId: string }
  >();
  const selectedTrack = state.midiTracks.find(
    (track) => track.id === selection?.trackId,
  );
  const selectedNoteIds = selection?.noteIds;

  useEffect(() => {
    if (!selection) {
      return;
    }
    const track = state.midiTracks.find(
      (entry) => entry.id === selection.trackId,
    );
    const availableIds = new Set(track?.notes.map((note) => note.id));
    const noteIds = new Set(
      [...selection.noteIds].filter((noteId) => availableIds.has(noteId)),
    );
    if (noteIds.size !== selection.noteIds.size) {
      cancelEdit();
      setSelection(noteIds.size > 0 ? { ...selection, noteIds } : undefined);
    }
  }, [state.midiTracks, selection]);

  function isSelected(trackId: string, noteId: string) {
    return selection?.trackId === trackId && selection.noteIds.has(noteId);
  }

  function hasTrackSelection(trackId: string) {
    return selection?.trackId === trackId;
  }

  function getEditPreview({
    trackId,
    noteId,
  }: {
    trackId: string;
    noteId: string;
  }) {
    return edit?.trackId === trackId && edit.note.id === noteId
      ? edit.note
      : undefined;
  }

  function select({
    trackId,
    noteId,
    additive = false,
  }: {
    trackId: string;
    noteId: string;
    additive?: boolean;
  }) {
    cancelEdit();
    onSelect();
    setSelection((current) => {
      if (!additive || current?.trackId !== trackId) {
        return { trackId, noteIds: new Set([noteId]) };
      }
      const noteIds = new Set(current.noteIds);
      if (noteIds.has(noteId)) {
        noteIds.delete(noteId);
      } else {
        noteIds.add(noteId);
      }
      return noteIds.size > 0 ? { trackId, noteIds } : undefined;
    });
  }

  function getBoxSelectionPreview(trackId: string) {
    return boxSelection?.trackId === trackId ? boxSelection : undefined;
  }

  function startBoxSelection({
    trackId,
    position,
  }: {
    trackId: string;
    position: MidiGridPosition;
  }) {
    cancelEdit();
    onSelect();
    setBoxSelection({ trackId, start: position, current: position });
  }

  function updateBoxSelection(position: MidiGridPosition) {
    if (boxSelection) {
      setBoxSelection({ ...boxSelection, current: position });
    }
  }

  function finishBoxSelection(end: MidiGridPosition) {
    if (!boxSelection) {
      return;
    }
    const { trackId, start } = boxSelection;
    cancelEdit();
    const track = state.midiTracks.find((entry) => entry.id === trackId);
    if (!track) {
      return;
    }
    const minBeat = Math.min(start.beat, end.beat);
    const maxBeat = Math.max(start.beat, end.beat);
    // Include both endpoint rows when resolving the continuous selection box.
    const minPitch = Math.floor(Math.min(start.pitch, end.pitch));
    const maxPitch = Math.floor(Math.max(start.pitch, end.pitch));
    const noteIds = new Set(
      track.notes
        .filter(
          (note) =>
            note.start < maxBeat &&
            minBeat < note.start + note.duration &&
            minPitch <= note.pitch &&
            note.pitch <= maxPitch,
        )
        .map((note) => note.id),
    );
    setSelection(noteIds.size > 0 ? { trackId, noteIds } : undefined);
  }

  function startEdit({
    trackId,
    noteId,
    beat,
    mode,
  }: {
    trackId: string;
    noteId: string;
    beat: number;
    mode: EditMode;
  }) {
    // TODO: Move and resize the whole selection instead of selecting only the grabbed note.
    select({ trackId, noteId });
    const original = state.midiTracks
      .find((track) => track.id === trackId)
      ?.notes.find((note) => note.id === noteId);
    if (!original) {
      return;
    }
    const step = 1 / subdivisionsPerBeat;
    // Preserve the grabbed cell's offset from the note start while moving.
    const grabOffset = snapToGrid(beat - original.start, step, {
      floor: true,
    });
    const originalEnd = original.start + original.duration;
    setEdit({
      trackId,
      original,
      note: original,
      getNote: ({ beat, pitch }) => {
        switch (mode) {
          case "move": {
            const cellStart = snapToGrid(beat, step, { floor: true });
            return {
              ...original,
              start: Math.max(0, cellStart - grabOffset),
              pitch: clampPitch(Math.floor(pitch)),
            };
          }
          case "resize-start": {
            const start = clamp(
              snapToGrid(beat, step),
              0,
              Math.max(0, originalEnd - step),
            );
            return { ...original, start, duration: originalEnd - start };
          }
          case "resize-end": {
            const end = Math.max(snapToGrid(beat, step), original.start + step);
            return { ...original, duration: end - original.start };
          }
        }
      },
    });
  }

  function updateEdit(position: MidiGridPosition) {
    const note = edit?.getNote(position);
    if (
      edit &&
      note &&
      (note.start !== edit.note.start ||
        note.pitch !== edit.note.pitch ||
        note.duration !== edit.note.duration)
    ) {
      setEdit({ ...edit, note });
    }
    return note;
  }

  function finishEdit(position: MidiGridPosition) {
    // Calculate from the release position rather than waiting for a preview render.
    const note = edit?.getNote(position);
    if (!edit || !note) {
      return;
    }
    cancelEdit();
    const { trackId, original } = edit;
    const track = state.midiTracks.find((track) => track.id === trackId);
    if (
      track &&
      (note.start !== original.start ||
        note.pitch !== original.pitch ||
        note.duration !== original.duration)
    ) {
      runtime.setMidiTrackNotes(
        trackId,
        track.notes.map((entry) => (entry.id === note.id ? note : entry)),
      );
    }
  }

  function cancelEdit() {
    setEdit(undefined);
    setBoxSelection(undefined);
  }

  function clear() {
    cancelEdit();
    setSelection(undefined);
  }

  function create({
    trackId,
    pitch,
    beat,
  }: {
    trackId: string;
    pitch: number;
    beat: number;
  }) {
    const track = state.midiTracks.find((track) => track.id === trackId);
    if (!track) {
      return;
    }
    const note = {
      id: crypto.randomUUID(),
      pitch: clampPitch(Math.floor(pitch)),
      start: Math.max(
        0,
        snapToGrid(beat, 1 / subdivisionsPerBeat, { floor: true }),
      ),
      duration: 1 / subdivisionsPerBeat,
      velocity: 100,
    };
    runtime.setMidiTrackNotes(trackId, [...track.notes, note]);
    select({ trackId, noteId: note.id });
    return note;
  }

  function removeSelected() {
    cancelEdit();
    if (selectedTrack && selectedNoteIds) {
      runtime.setMidiTrackNotes(
        selectedTrack.id,
        selectedTrack.notes.filter((note) => !selectedNoteIds.has(note.id)),
      );
    }
    setSelection(undefined);
  }

  function handleTabAnnotationShortcut(event: KeyboardEvent): boolean {
    // TODO: Apply tab string assignment, changes, and reset to the whole selection.
    const selectedNote =
      selectedNoteIds?.size === 1
        ? selectedTrack?.notes.find((note) => selectedNoteIds.has(note.id))
        : undefined;
    if (!selectedTrack?.tabAnnotationEnabled || !selectedNote) {
      return false;
    }
    const tabString = ([1, 2, 3, 4, 5] as const).find((string) =>
      matchKeyboardEvent(event, String(string)),
    );
    const target = { trackId: selectedTrack.id, noteId: selectedNote.id };
    if (tabString) {
      runtime.setMidiNoteTabString({ ...target, tabString });
    } else if (matchKeyboardEvent(event, "0")) {
      runtime.setMidiNoteTabString(target);
    } else if (
      matchKeyboardEvent(event, "ArrowUp") ||
      matchKeyboardEvent(event, "ArrowDown")
    ) {
      const move = moveTabString({
        pitch: selectedNote.pitch,
        tabString: selectedNote.tabString,
        openStringPitches: selectedTrack.tabOpenStringPitches,
        direction: matchKeyboardEvent(event, "ArrowUp") ? "up" : "down",
      });
      if (move && move.after !== move.before) {
        runtime.setMidiNoteTabString({ ...target, tabString: move.after });
      }
    } else {
      return false;
    }
    return true;
  }

  return {
    activate: onSelect,
    clear,
    hasSelection: selection !== undefined,
    hasTrackSelection,
    isSelected,
    select,
    startBoxSelection,
    updateBoxSelection,
    finishBoxSelection,
    getBoxSelectionPreview,
    startEdit,
    updateEdit,
    finishEdit,
    cancelEdit,
    getEditPreview,
    create,
    removeSelected,
    handleTabAnnotationShortcut,
  };
}

export function getMidiGridPosition({
  x,
  y,
  viewportStartBeat,
  pixelsPerBeat,
  pixelsPerKey,
}: {
  x: number;
  y: number;
  viewportStartBeat: number;
  pixelsPerBeat: number;
  pixelsPerKey: number;
}): MidiGridPosition {
  return {
    beat: viewportStartBeat + x / pixelsPerBeat,
    pitch: MAX_PITCH + 1 - y / pixelsPerKey,
  };
}

export function getMidiBoxSelectionRect({
  selection: { start, current },
  viewportStartBeat,
  pixelsPerBeat,
  pixelsPerKey,
}: {
  selection: MidiBoxSelection;
  viewportStartBeat: number;
  pixelsPerBeat: number;
  pixelsPerKey: number;
}) {
  const firstBeat = Math.min(start.beat, current.beat);
  const lastBeat = Math.max(start.beat, current.beat);
  const lowestPitch = Math.min(start.pitch, current.pitch);
  const highestPitch = Math.max(start.pitch, current.pitch);

  return {
    left: (firstBeat - viewportStartBeat) * pixelsPerBeat,
    top: (MAX_PITCH + 1 - highestPitch) * pixelsPerKey,
    width: (lastBeat - firstBeat) * pixelsPerBeat,
    height: (highestPitch - lowestPitch) * pixelsPerKey,
  };
}
