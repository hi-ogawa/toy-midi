import type { Note } from "../../types.ts";
import type { MidiTrackState } from "./runtime.ts";

// TODO: Reduce snapshot memory by recording only affected notes through a runtime API:
// editMidiTrackNotes({ trackId, upsert: changedOrAddedNotes, remove: deletedNoteIds }).
// Capture complete before/after notes for those IDs and migrate callers incrementally.
// Keep full snapshots for setMidiTrackNotes replacements such as transcription, and
// preserve array ordering when undo restores deleted notes.
export type RecorderHistoryChange =
  | { type: "midi-notes"; trackId: string; notes: Note[] }
  | {
      type: "midi-track";
      trackId: string;
      snapshot?: { track: MidiTrackState; index: number };
    };

type RecorderHistoryEntry = {
  before: RecorderHistoryChange;
  after: RecorderHistoryChange;
};

type ApplyChange = (change: RecorderHistoryChange) => void | Promise<void>;

const MAX_HISTORY = 50;

// Keep one chronological stack per recorder project as more edit domains are added.
// TODO: Coordinate async replay with overlapping undo/redo, edits, and project loading.
export class RecorderHistory {
  private undoStack: RecorderHistoryEntry[] = [];
  private redoStack: RecorderHistoryEntry[] = [];

  push(entry: RecorderHistoryEntry): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  async undo(apply: ApplyChange): Promise<void> {
    const entry = this.undoStack.at(-1);
    if (!entry) {
      return;
    }
    await apply(entry.before);
    this.undoStack.pop();
    this.redoStack.push(entry);
  }

  async redo(apply: ApplyChange): Promise<void> {
    const entry = this.redoStack.at(-1);
    if (!entry) {
      return;
    }
    await apply(entry.after);
    this.redoStack.pop();
    this.undoStack.push(entry);
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
