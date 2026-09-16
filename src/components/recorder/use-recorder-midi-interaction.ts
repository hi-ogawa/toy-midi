import { useEffect, useState } from "react";
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
  const [move, setMove] = useState<{
    trackId: string;
    original: Note;
    note: Note;
    cellOffset: number;
    step: number;
  }>();
  const selectedTrack = state.midiTracks.find(
    (track) => track.id === selection?.trackId,
  );
  const selectedNote = selectedTrack?.notes.find(
    (note) => note.id === selection?.noteId,
  );

  useEffect(() => {
    if (!selectedNote) {
      cancelMove();
      setSelection(undefined);
    }
  }, [selectedNote]);

  function getSelectedNoteId(trackId: string) {
    return selectedNote && selection?.trackId === trackId
      ? selection.noteId
      : undefined;
  }

  function getMovePreview({
    trackId,
    noteId,
  }: {
    trackId: string;
    noteId: string;
  }) {
    return move?.trackId === trackId && move.note.id === noteId
      ? move.note
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
    const original = state.midiTracks
      .find((track) => track.id === trackId)
      ?.notes.find((note) => note.id === noteId);
    if (!original) {
      return;
    }
    const step = 1 / subdivisionsPerBeat;
    setMove({
      trackId,
      original,
      note: original,
      step,
      cellOffset: Math.floor((beat - original.start) / step),
    });
  }

  function updateMove(position: { beat: number; pitch: number }) {
    const note = getMovedNote(position);
    if (
      move &&
      note &&
      (note.start !== move.note.start || note.pitch !== move.note.pitch)
    ) {
      setMove({ ...move, note });
    }
    return note;
  }

  function finishMove(position: { beat: number; pitch: number }) {
    // Calculate from the release position rather than waiting for a preview render.
    const note = getMovedNote(position);
    if (!move || !note) {
      return;
    }
    cancelMove();
    const { trackId, original } = move;
    const track = state.midiTracks.find((track) => track.id === trackId);
    if (
      track &&
      (note.start !== original.start || note.pitch !== original.pitch)
    ) {
      runtime.setMidiTrackNotes(
        trackId,
        track.notes.map((entry) => (entry.id === note.id ? note : entry)),
      );
    }
  }

  function getMovedNote({ beat, pitch }: { beat: number; pitch: number }) {
    if (!move) {
      return;
    }
    return {
      ...move.original,
      start: Math.max(
        0,
        snapToGrid(beat, move.step, { floor: true }) -
          move.cellOffset * move.step,
      ),
      pitch: clampPitch(pitch),
    };
  }

  function cancelMove() {
    setMove(undefined);
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
    getMovePreview,
    create,
    removeSelected,
  };
}
