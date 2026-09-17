import { useEffect, useState } from "react";
import { clamp, clampPitch, snapToGrid } from "../../lib/music";
import type {
  RecorderRuntime,
  RecorderRuntimeState,
} from "../../lib/recorder/runtime";
import type { Note } from "../../types";

type MidiNoteEdit = {
  trackId: string;
  original: Note;
  note: Note;
  getNote: GetNote;
};

type EditPosition = { beat: number; pitch: number };
type GetNote = (position: EditPosition) => Note;
type EditMode = "move" | "resize-start" | "resize-end";

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
  const [selection, setSelection] = useState<{
    trackId: string;
    noteIds: Set<string>;
  }>();
  const [edit, setEdit] = useState<MidiNoteEdit>();
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
    return selection?.trackId === trackId && selection.noteIds.size > 0;
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

  function selectBox({
    trackId,
    start,
    end,
  }: {
    trackId: string;
    start: EditPosition;
    end: EditPosition;
  }) {
    cancelEdit();
    onSelect();
    const track = state.midiTracks.find((entry) => entry.id === trackId);
    if (!track) {
      return;
    }
    const minBeat = Math.min(start.beat, end.beat);
    const maxBeat = Math.max(start.beat, end.beat);
    const minPitch = Math.min(start.pitch, end.pitch);
    const maxPitch = Math.max(start.pitch, end.pitch);
    const noteIds = new Set(
      track.notes
        .filter(
          (note) =>
            note.start < maxBeat &&
            note.start + note.duration > minBeat &&
            note.pitch >= minPitch &&
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
              pitch: clampPitch(pitch),
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

  function updateEdit(position: EditPosition) {
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

  function finishEdit(position: EditPosition) {
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
      pitch,
      start: Math.max(
        0,
        snapToGrid(beat, 1 / subdivisionsPerBeat, { floor: true }),
      ),
      duration: 1 / subdivisionsPerBeat,
      velocity: 100,
    };
    runtime.setMidiTrackNotes(trackId, [...track.notes, note]);
    select({ trackId, noteId: note.id });
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

  return {
    activate: onSelect,
    clear,
    hasSelection: selectedNoteIds !== undefined && selectedNoteIds.size > 0,
    hasTrackSelection,
    isSelected,
    select,
    selectBox,
    startEdit,
    updateEdit,
    finishEdit,
    cancelEdit,
    getEditPreview,
    create,
    removeSelected,
  };
}
