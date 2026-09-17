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
  getNote: (position: { beat: number; pitch: number }) => Note;
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
  const [selection, setSelection] = useState<{
    trackId: string;
    noteId: string;
  }>();
  const [edit, setEdit] = useState<MidiNoteEdit>();
  const selectedTrack = state.midiTracks.find(
    (track) => track.id === selection?.trackId,
  );
  const selectedNote = selectedTrack?.notes.find(
    (note) => note.id === selection?.noteId,
  );

  useEffect(() => {
    if (!selectedNote) {
      cancelEdit();
      setSelection(undefined);
    }
  }, [selectedNote]);

  function getSelectedNoteId(trackId: string) {
    return selectedNote && selection?.trackId === trackId
      ? selection.noteId
      : undefined;
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
    pixelsPerBeat,
  }: {
    trackId: string;
    noteId: string;
    beat: number;
    mode: "move" | "resize-start" | "resize-end";
    pixelsPerBeat: number;
  }) {
    select({ trackId, noteId });
    const original = state.midiTracks
      .find((track) => track.id === trackId)
      ?.notes.find((note) => note.id === noteId);
    if (!original) {
      return;
    }
    const gridStep = 1 / subdivisionsPerBeat;
    // Keep the grabbed grid cell under the pointer instead of snapping the note start to it.
    const grabOffset = snapToGrid(beat - original.start, gridStep, {
      floor: true,
    });
    const toleranceBeats =
      clamp(gridStep * pixelsPerBeat * 0.15, 2, 8) / pixelsPerBeat;
    const originalEnd = original.start + original.duration;
    const snapEdgeCell = createDraggedGridCellSnapper({
      // Resize handles track the first or last occupied grid cell.
      initial: mode === "resize-end" ? originalEnd - gridStep : original.start,
      step: gridStep,
      tolerance: toleranceBeats,
      min: mode === "resize-end" ? original.start : 0,
      max:
        mode === "resize-start"
          ? Math.max(0, originalEnd - gridStep)
          : Number.POSITIVE_INFINITY,
    });
    setEdit({
      trackId,
      original,
      note: original,
      getNote: ({ beat, pitch }) => {
        switch (mode) {
          case "move": {
            const cellStart = snapToGrid(beat, gridStep, { floor: true });
            return {
              ...original,
              start: Math.max(0, cellStart - grabOffset),
              pitch: clampPitch(pitch),
            };
          }
          case "resize-start": {
            // A coarser grid may leave no room for a whole cell before the fixed end.
            if (originalEnd < gridStep) {
              return original;
            }
            const start = snapEdgeCell(beat);
            return { ...original, start, duration: originalEnd - start };
          }
          case "resize-end": {
            const edgeCellStart = snapEdgeCell(beat);
            const end = edgeCellStart + gridStep;
            return { ...original, duration: end - original.start };
          }
        }
      },
    });
  }

  function updateEdit(position: { beat: number; pitch: number }) {
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

  function finishEdit(position: { beat: number; pitch: number }) {
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
    getEditPreview,
    create,
    removeSelected,
  };
}

// Return the active grid cell's start as the pointer crosses cell boundaries.
function createDraggedGridCellSnapper({
  initial,
  step,
  tolerance,
  min,
  max,
}: {
  initial: number;
  step: number;
  tolerance: number;
  min: number;
  max: number;
}) {
  let current = initial;

  return (position: number) => {
    // Retain the current cell inside the tolerance band, including when reversing direction.
    if (position < current - tolerance) {
      current = snapToGrid(position + tolerance, step, {
        floor: true,
      });
    } else if (position > current + step + tolerance) {
      current = snapToGrid(position - tolerance, step, {
        floor: true,
      });
    }

    current = clamp(current, min, max);
    return current;
  };
}
