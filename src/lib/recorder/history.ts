import type { Note } from "../../types.ts";

type MidiHistoryEntry = {
  trackId: string;
  before: Note[];
  after: Note[];
};

type ApplyNotes = (change: { trackId: string; notes: Note[] }) => void;

const MAX_HISTORY = 50;

export class RecorderMidiHistory {
  private undoStack: MidiHistoryEntry[] = [];
  private redoStack: MidiHistoryEntry[] = [];

  push(entry: MidiHistoryEntry): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  undo(apply: ApplyNotes): void {
    const entry = this.undoStack.at(-1);
    if (!entry) {
      return;
    }
    apply({ trackId: entry.trackId, notes: entry.before });
    this.undoStack.pop();
    this.redoStack.push(entry);
  }

  redo(apply: ApplyNotes): void {
    const entry = this.redoStack.at(-1);
    if (!entry) {
      return;
    }
    apply({ trackId: entry.trackId, notes: entry.after });
    this.redoStack.pop();
    this.undoStack.push(entry);
  }

  removeTrack(trackId: string): void {
    this.undoStack = this.undoStack.filter(
      (entry) => entry.trackId !== trackId,
    );
    this.redoStack = this.redoStack.filter(
      (entry) => entry.trackId !== trackId,
    );
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
