import { useEffect, useState } from "react";
import { matchKeyboardEvent } from "../../lib/keyboard";
import { snapToGrid } from "../../lib/music";
import type {
  RecorderRuntime,
  RecorderRuntimeState,
} from "../../lib/recorder/runtime";
import { moveTabString } from "../../lib/tab-annotation";

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

  function getSelectedNoteId(trackId: string) {
    return selectedNote && selection?.trackId === trackId
      ? selection.noteId
      : undefined;
  }

  function select(selection: { trackId: string; noteId: string }) {
    onSelect();
    setSelection(selection);
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
    if (selectedTrack && selectedNote) {
      runtime.setMidiTrackNotes(
        selectedTrack.id,
        selectedTrack.notes.filter((note) => note.id !== selectedNote.id),
      );
    }
    setSelection(undefined);
  }

  function handleTabShortcut(event: KeyboardEvent): boolean {
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
    handleTabShortcut,
    activate: onSelect,
    clear: () => setSelection(undefined),
    hasSelection: selectedNote !== undefined,
    getSelectedNoteId,
    select,
    create,
    removeSelected,
  };
}
