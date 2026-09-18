import type { Note } from "../../types.ts";

// TODO: Reduce snapshot memory by recording only affected notes through a runtime API:
// editMidiTrackNotes({ trackId, upsert: changedOrAddedNotes, remove: deletedNoteIds }).
// Capture complete before/after notes for those IDs and migrate callers incrementally.
// Keep full snapshots for setMidiTrackNotes replacements such as transcription, and
// preserve array ordering when undo restores deleted notes.
export type RecorderChange = {
  type: "midi-notes";
  trackId: string;
  notes: Note[];
};

type HistoryEntry = {
  before: RecorderChange;
  after: RecorderChange;
};

type ApplyChange = (change: RecorderChange) => void;

const MAX_HISTORY = 50;

// Keep one chronological stack per recorder project as more edit domains are added.
// MIDI note edits are the first supported domain.
export class RecorderHistory {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  push(entry: HistoryEntry): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  undo(apply: ApplyChange): void {
    const entry = this.undoStack.at(-1);
    if (!entry) {
      return;
    }
    apply(entry.before);
    this.undoStack.pop();
    this.redoStack.push(entry);
  }

  redo(apply: ApplyChange): void {
    const entry = this.redoStack.at(-1);
    if (!entry) {
      return;
    }
    apply(entry.after);
    this.redoStack.pop();
    this.undoStack.push(entry);
  }

  prune(matches: (entry: HistoryEntry) => boolean): void {
    this.undoStack = this.undoStack.filter((entry) => !matches(entry));
    this.redoStack = this.redoStack.filter((entry) => !matches(entry));
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
