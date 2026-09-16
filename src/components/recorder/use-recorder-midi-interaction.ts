import { useEffect, useRef, useState } from "react";
import { clampPitch, snapToGrid } from "../../lib/music";
import type {
  RecorderRuntime,
  RecorderRuntimeState,
} from "../../lib/recorder/runtime";
import type { Note } from "../../types";

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
    noteId: string;
  }>();
  const edit = useRef<{
    trackId: string;
    mode: "move" | "resize-start" | "resize-end";
    original: Note;
    note: Note;
    cellOffset: number;
    step: number;
  }>(undefined);
  const [editPreview, setEditPreview] = useState<{
    trackId: string;
    note: Note;
  }>();
  const selectedTrack = state.midiTracks.find(
    (track) => track.id === selection?.trackId,
  );
  const selectedNote = selectedTrack?.notes.find(
    (note) => note.id === selection?.noteId,
  );

  useEffect(() => {
    if (!selectedNote) {
      setSelection(undefined);
    }
  }, [selectedNote]);

  // Discard an edit if its note is removed or replaced while the pointer is held.
  useEffect(() => {
    const current = edit.current;
    if (
      current &&
      !state.midiTracks
        .find((track) => track.id === current.trackId)
        ?.notes.includes(current.original)
    ) {
      cancelEdit();
    }
  }, [state.midiTracks]);

  function getSelectedNoteId(trackId: string) {
    return selectedNote && selection?.trackId === trackId
      ? selection.noteId
      : undefined;
  }

  function select(selection: { trackId: string; noteId: string }) {
    cancelEdit();
    onSelect();
    setSelection(selection);
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
    mode: "move" | "resize-start" | "resize-end";
  }) {
    select({ trackId, noteId });
    const original = runtime.store
      .get()
      .midiTracks.find((track) => track.id === trackId)
      ?.notes.find((note) => note.id === noteId);
    if (!original) {
      return;
    }
    const step = 1 / subdivisionsPerBeat;
    edit.current = {
      trackId,
      mode,
      original,
      note: original,
      step,
      cellOffset: Math.floor((beat - original.start) / step),
    };
  }

  function updateEdit({ beat, pitch }: { beat: number; pitch: number }) {
    const current = edit.current;
    if (!current) {
      return;
    }
    const { original, step } = current;
    const cellStart = Math.floor(beat / step) * step;
    let note: Note;
    switch (current.mode) {
      case "move": {
        note = {
          ...original,
          start: Math.max(0, cellStart - current.cellOffset * step),
          pitch: clampPitch(pitch),
        };
        break;
      }
      case "resize-start": {
        const end = original.start + original.duration;
        // A coarser grid may leave no room for a whole cell before the fixed end.
        if (end < step) {
          return current.note;
        }
        const start = Math.max(0, Math.min(end - step, cellStart));
        note = { ...original, start, duration: end - start };
        break;
      }
      case "resize-end": {
        note = {
          ...original,
          duration: Math.max(step, cellStart + step - original.start),
        };
        break;
      }
    }
    if (
      note.start !== current.note.start ||
      note.pitch !== current.note.pitch ||
      note.duration !== current.note.duration
    ) {
      current.note = note;
      setEditPreview({ trackId: current.trackId, note });
    }
    return current.note;
  }

  function finishEdit() {
    const current = edit.current;
    cancelEdit();
    if (!current) {
      return;
    }
    const { trackId, original, note } = current;
    const track = runtime.store
      .get()
      .midiTracks.find((track) => track.id === trackId);
    if (
      track?.notes.includes(original) &&
      (note.start !== original.start ||
        note.pitch !== original.pitch ||
        note.duration !== original.duration)
    ) {
      runtime.setMidiTrackNotes(
        trackId,
        track.notes.map((entry) => (entry === original ? note : entry)),
      );
    }
  }

  function cancelEdit() {
    edit.current = undefined;
    setEditPreview(undefined);
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
    const track = runtime.store
      .get()
      .midiTracks.find((track) => track.id === trackId);
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
    if (selectedTrack && selectedNote) {
      runtime.setMidiTrackNotes(
        selectedTrack.id,
        selectedTrack.notes.filter((note) => note.id !== selectedNote.id),
      );
    }
    setSelection(undefined);
  }

  return {
    activate: onSelect,
    clear,
    hasSelection: selectedNote !== undefined,
    getSelectedNoteId,
    startEdit,
    updateEdit,
    finishEdit,
    cancelEdit,
    getEditPreview: (trackId: string) =>
      editPreview?.trackId === trackId ? editPreview.note : undefined,
    create,
    removeSelected,
  };
}
