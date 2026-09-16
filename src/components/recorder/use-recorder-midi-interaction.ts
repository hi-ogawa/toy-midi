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
  const move = useRef<{
    trackId: string;
    original: Note;
    note: Note;
    cellOffset: number;
    step: number;
  }>(undefined);
  const [movePreview, setMovePreview] = useState<{
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
    const current = move.current;
    if (
      current &&
      !state.midiTracks
        .find((track) => track.id === current.trackId)
        ?.notes.includes(current.original)
    ) {
      cancelMove();
    }
  }, [state.midiTracks]);

  function getSelectedNoteId(trackId: string) {
    return selectedNote && selection?.trackId === trackId
      ? selection.noteId
      : undefined;
  }

  function select(selection: { trackId: string; noteId: string }) {
    cancelMove();
    onSelect();
    setSelection(selection);
  }

  function startMove({
    trackId,
    noteId,
    beat,
  }: {
    trackId: string;
    noteId: string;
    beat: number;
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
    move.current = {
      trackId,
      original,
      note: original,
      step,
      cellOffset: Math.floor((beat - original.start) / step),
    };
  }

  function updateMove({ beat, pitch }: { beat: number; pitch: number }) {
    const current = move.current;
    if (!current) {
      return;
    }
    const start = Math.max(
      0,
      (Math.floor(beat / current.step) - current.cellOffset) * current.step,
    );
    const nextPitch = clampPitch(pitch);
    if (start !== current.note.start || nextPitch !== current.note.pitch) {
      current.note = { ...current.original, start, pitch: nextPitch };
      setMovePreview({ trackId: current.trackId, note: current.note });
    }
    return current.note;
  }

  function finishMove() {
    const current = move.current;
    cancelMove();
    if (!current) {
      return;
    }
    const { trackId, original, note } = current;
    const track = runtime.store
      .get()
      .midiTracks.find((track) => track.id === trackId);
    if (
      track?.notes.includes(original) &&
      (note.start !== original.start || note.pitch !== original.pitch)
    ) {
      runtime.setMidiTrackNotes(
        trackId,
        track.notes.map((entry) => (entry === original ? note : entry)),
      );
    }
  }

  function cancelMove() {
    move.current = undefined;
    setMovePreview(undefined);
  }

  function clear() {
    cancelMove();
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
    cancelMove();
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
    startMove,
    updateMove,
    finishMove,
    cancelMove,
    getMovePreview: (trackId: string) =>
      movePreview?.trackId === trackId ? movePreview.note : undefined,
    create,
    removeSelected,
  };
}
