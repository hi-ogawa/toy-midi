import { useEffect, useState } from "react";
import { matchKeyboardEvent } from "../../lib/keyboard";
import { clamp, clampPitch, MAX_PITCH, snapToGrid } from "../../lib/music";
import type {
  RecorderRuntime,
  RecorderRuntimeState,
} from "../../lib/recorder/runtime";
import { getFret, moveTabString } from "../../lib/tab-annotation";
import type { Note } from "../../types";

type MidiNoteEdit = {
  trackId: string;
  primaryId: string;
  originals: Note[];
  notes: Note[];
  getNotes: EditGetNotes;
};

type MidiNoteDuplicate = {
  trackId: string;
  primaryId: string;
  notes: Note[];
  getNotes: EditGetNotes;
};

// The pitch axis spans [0, MAX_PITCH + 1] upward. Note p occupies [p, p + 1).
type MidiGridPosition = { beat: number; pitch: number };
type EditGetNotes = (position: MidiGridPosition) => Note[];
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
  const [clipboard, setClipboard] = useState<{
    trackId: string;
    notes: Note[];
  }>();
  const [boxSelection, setBoxSelection] = useState<
    MidiBoxSelection & { trackId: string }
  >();
  const [duplicate, setDuplicate] = useState<MidiNoteDuplicate>();
  const selectedTrack = state.midiTracks.find(
    (track) => track.id === selection?.trackId,
  );
  const selectedNoteIds = selection?.noteIds;

  // Reconcile selection when notes are removed outside this interaction.
  useEffect(() => {
    if (!selection) {
      return;
    }
    const track = state.midiTracks.find(
      (entry) => entry.id === selection.trackId,
    );
    const availableIds = new Set(track?.notes.map((note) => note.id));
    const noteIds = selection.noteIds.intersection(availableIds);
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
    return edit?.trackId === trackId
      ? edit.notes.find((note) => note.id === noteId)
      : undefined;
  }

  function getDuplicatePreviews(trackId: string) {
    return duplicate?.trackId === trackId ? duplicate.notes : [];
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
    const track = state.midiTracks.find((entry) => entry.id === trackId);
    const primary = track?.notes.find((note) => note.id === noteId);
    if (!track || !primary) {
      return;
    }
    cancelEdit();
    onSelect();
    let originals = track.notes.filter((note) => selectedNoteIds?.has(note.id));
    if (!isSelected(trackId, noteId)) {
      originals = [primary];
      setSelection({ trackId, noteIds: new Set([noteId]) });
    }
    const step = 1 / subdivisionsPerBeat;
    setEdit({
      trackId,
      primaryId: noteId,
      originals,
      notes: originals,
      getNotes: createEditGetNotes({
        mode,
        primary,
        originals,
        grabBeat: beat,
        step,
      }),
    });
  }

  function updateEdit(position: MidiGridPosition) {
    if (!edit) {
      return;
    }
    const notes = edit.getNotes(position);
    setEdit({ ...edit, notes });
    return notes.find((note) => note.id === edit.primaryId);
  }

  function finishEdit(position: MidiGridPosition) {
    // Calculate from the release position rather than waiting for a preview render.
    if (!edit) {
      return;
    }
    const notes = edit.getNotes(position);
    cancelEdit();
    const { trackId, originals } = edit;
    const track = state.midiTracks.find((track) => track.id === trackId);
    const changed = notes.some((note, index) => {
      const original = originals[index];
      return (
        note.start !== original.start ||
        note.pitch !== original.pitch ||
        note.duration !== original.duration
      );
    });
    if (track && changed) {
      const updates = new Map(notes.map((note) => [note.id, note]));
      runtime.setMidiTrackNotes(
        trackId,
        track.notes.map((note) => updates.get(note.id) ?? note),
      );
    }
  }

  function startDuplicate({
    trackId,
    noteId,
    initialBeat,
    position,
  }: {
    trackId: string;
    noteId: string;
    initialBeat: number;
    position: MidiGridPosition;
  }) {
    cancelEdit();
    onSelect();
    const track = state.midiTracks.find((entry) => entry.id === trackId);
    const originals = track?.notes.filter((note) =>
      selectedNoteIds?.has(note.id),
    );
    const primary = originals?.find((note) => note.id === noteId);
    if (!track || !originals || originals.length === 0 || !primary) {
      return;
    }
    const step = 1 / subdivisionsPerBeat;
    const copies = originals.map((note) => ({
      ...note,
      id: crypto.randomUUID(),
    }));
    const primaryCopy = copies[originals.indexOf(primary)];
    const getNotes = createEditGetNotes({
      mode: "move",
      primary: primaryCopy,
      originals: copies,
      grabBeat: initialBeat,
      step,
    });
    const notes = getNotes(position);
    const next = {
      trackId,
      primaryId: primaryCopy.id,
      notes,
      getNotes,
    };
    setDuplicate(next);
    return notes.find((note) => note.id === next.primaryId);
  }

  function updateDuplicate(position: MidiGridPosition) {
    if (!duplicate) {
      return;
    }
    const notes = duplicate.getNotes(position);
    setDuplicate({ ...duplicate, notes });
    return notes.find((note) => note.id === duplicate.primaryId);
  }

  function finishDuplicate(position: MidiGridPosition) {
    if (!duplicate) {
      return;
    }
    const notes = duplicate.getNotes(position);
    const track = state.midiTracks.find(
      (entry) => entry.id === duplicate.trackId,
    );
    cancelEdit();
    if (!track) {
      return;
    }
    runtime.setMidiTrackNotes(track.id, [...track.notes, ...notes]);
    setSelection({
      trackId: track.id,
      noteIds: new Set(notes.map((note) => note.id)),
    });
  }

  function cancelEdit() {
    setEdit(undefined);
    setBoxSelection(undefined);
    setDuplicate(undefined);
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

  function copySelected() {
    if (!selectedTrack || !selectedNoteIds) {
      return false;
    }
    const notes = selectedTrack.notes.filter((note) =>
      selectedNoteIds.has(note.id),
    );
    if (notes.length === 0) {
      return false;
    }
    setClipboard({
      trackId: selectedTrack.id,
      notes: notes.map((note) => ({ ...note })),
    });
    return true;
  }

  function paste(insertBeat: number) {
    if (!clipboard) {
      return false;
    }
    const track = state.midiTracks.find(
      (entry) => entry.id === clipboard.trackId,
    );
    if (!track || track.viewMode === "overview") {
      return false;
    }
    cancelEdit();
    onSelect();
    const minStart = Math.min(...clipboard.notes.map((note) => note.start));
    const deltaStart = insertBeat - minStart;
    const notes = clipboard.notes.map((note) => ({
      ...note,
      id: crypto.randomUUID(),
      start: note.start + deltaStart,
    }));
    runtime.setMidiTrackNotes(track.id, [...track.notes, ...notes]);
    setSelection({
      trackId: track.id,
      noteIds: new Set(notes.map((note) => note.id)),
    });
    return true;
  }

  function handleTabAnnotationShortcut(event: KeyboardEvent): boolean {
    if (
      !selectedTrack?.tabAnnotationEnabled ||
      !selectedNoteIds ||
      selectedNoteIds.size === 0
    ) {
      return false;
    }
    const tabString = ([1, 2, 3, 4, 5] as const).find((string) =>
      matchKeyboardEvent(event, String(string)),
    );
    const reset = matchKeyboardEvent(event, "0");
    const direction = matchKeyboardEvent(event, "ArrowUp")
      ? "up"
      : matchKeyboardEvent(event, "ArrowDown")
        ? "down"
        : undefined;
    if (!tabString && !reset && !direction) {
      return false;
    }
    let changed = false;
    const notes = selectedTrack.notes.map((note) => {
      if (!selectedNoteIds.has(note.id)) {
        return note;
      }
      let next = note.tabString;
      if (tabString) {
        const fret = getFret({
          pitch: note.pitch,
          tabString,
          openStringPitches: selectedTrack.tabOpenStringPitches,
        });
        if (fret !== undefined) {
          next = tabString;
        }
      } else if (reset) {
        next = undefined;
      } else if (direction) {
        const move = moveTabString({
          pitch: note.pitch,
          tabString: note.tabString,
          openStringPitches: selectedTrack.tabOpenStringPitches,
          direction,
        });
        if (move && move.after !== move.before) {
          next = move.after;
        }
      }
      if (next === note.tabString) {
        return note;
      }
      changed = true;
      return { ...note, tabString: next };
    });
    if (changed) {
      runtime.setMidiTrackNotes(selectedTrack.id, notes);
    }
    return true;
  }

  function toggleViewMode(trackId: string) {
    const track = state.midiTracks.find((entry) => entry.id === trackId);
    if (!track) {
      return;
    }
    if (hasTrackSelection(trackId)) {
      clear();
    }
    runtime.setMidiTrackSettings(trackId, {
      viewMode: track.viewMode === "overview" ? "editor" : "overview",
    });
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
    startDuplicate,
    updateDuplicate,
    finishDuplicate,
    cancelEdit,
    getEditPreview,
    getDuplicatePreviews,
    create,
    removeSelected,
    copySelected,
    paste,
    handleTabAnnotationShortcut,
    toggleViewMode,
  };
}

function createEditGetNotes({
  mode,
  primary,
  originals,
  grabBeat,
  step,
}: {
  mode: EditMode;
  primary: Note;
  originals: Note[];
  grabBeat: number;
  step: number;
}): EditGetNotes {
  // Preserve the grabbed cell's offset from the note start while moving.
  const grabOffset = snapToGrid(grabBeat - primary.start, step, {
    floor: true,
  });
  const minStart = Math.min(...originals.map((note) => note.start));
  const minDuration = Math.min(...originals.map((note) => note.duration));
  const maxShrink = Math.max(0, minDuration - step);
  const minPitch = Math.min(...originals.map((note) => note.pitch));
  const maxPitch = Math.max(...originals.map((note) => note.pitch));
  const primaryEnd = primary.start + primary.duration;

  return ({ beat, pitch }) => {
    let deltaStart = 0;
    let deltaPitch = 0;
    let deltaDuration = 0;
    switch (mode) {
      case "move": {
        const nextStart = snapToGrid(beat, step, { floor: true }) - grabOffset;
        deltaStart = Math.max(nextStart - primary.start, -minStart);
        deltaPitch = clamp(
          Math.floor(pitch) - primary.pitch,
          -minPitch,
          MAX_PITCH - maxPitch,
        );
        break;
      }
      case "resize-start": {
        deltaStart = clamp(
          snapToGrid(beat, step) - primary.start,
          -minStart,
          maxShrink,
        );
        deltaDuration = -deltaStart;
        break;
      }
      case "resize-end": {
        deltaDuration = Math.max(
          snapToGrid(beat, step) - primaryEnd,
          -maxShrink,
        );
        break;
      }
    }
    return originals.map((note) => ({
      ...note,
      start: note.start + deltaStart,
      pitch: note.pitch + deltaPitch,
      duration: note.duration + deltaDuration,
    }));
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
