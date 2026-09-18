import type { Note } from "../../types.ts";

// TODO: Reduce snapshot memory by recording only affected notes through a runtime API:
// editMidiTrackNotes({ trackId, upsert: changedOrAddedNotes, remove: deletedNoteIds }).
// Capture complete before/after notes for those IDs and migrate callers incrementally.
// Keep full snapshots for setMidiTrackNotes replacements such as transcription, and
// preserve array ordering when undo restores deleted notes.
/** A state change that runtime can apply directly, including during undo and redo. */
export type RecorderChange = {
  type: "midi-notes";
  trackId: string;
  notes: Note[];
};

/** One committed edit, with changes that restore its previous and resulting state. */
type HistoryEntry = {
  before: RecorderChange;
  after: RecorderChange;
};

/**
 * Synchronously restore the described state and its runtime effects without recording
 * another history entry. If this throws, history keeps the entry on its original
 * stack, but cannot roll back any state the callback already changed.
 */
type ApplyChange = (change: RecorderChange) => void;

const MAX_HISTORY = 50;

/**
 * One chronological undo/redo history per recorder project.
 * The caller owns applying changes. History only stores RecorderChange values and passes them to the apply callback,
 * so entries and their referenced data must not be mutated after push or replay.
 */
export class RecorderHistory {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  /**
   * Record one edit after the caller has successfully applied it. Does not apply
   * either change or detect no-ops. Clears redo and retains the latest 50 edits.
   */
  push(entry: HistoryEntry): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  /**
   * Call apply(entry.before) for the latest edit, then move the entry to redo.
   * An empty stack is a no-op. A thrown error propagates without moving the entry.
   */
  undo(apply: ApplyChange): void {
    const entry = this.undoStack.at(-1);
    if (!entry) {
      return;
    }
    apply(entry.before);
    this.undoStack.pop();
    this.redoStack.push(entry);
  }

  /**
   * Call apply(entry.after) for the latest undone edit, then move the entry to undo.
   * An empty stack is a no-op. A thrown error propagates without moving the entry.
   */
  redo(apply: ApplyChange): void {
    const entry = this.redoStack.at(-1);
    if (!entry) {
      return;
    }
    apply(entry.after);
    this.redoStack.pop();
    this.undoStack.push(entry);
  }

  /** Remove matching entries from both stacks without applying any changes. */
  prune(matches: (entry: HistoryEntry) => boolean): void {
    this.undoStack = this.undoStack.filter((entry) => !matches(entry));
    this.redoStack = this.redoStack.filter((entry) => !matches(entry));
  }

  /** Forget both stacks without changing recorder state, for example on project load. */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
