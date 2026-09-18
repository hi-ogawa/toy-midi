import type { Note } from "../../types.ts";
import type { RecorderRuntime } from "./runtime.ts";

// TODO: Reduce snapshot memory by recording only affected notes through a runtime API:
// editMidiTrackNotes({ trackId, upsert: changedOrAddedNotes, remove: deletedNoteIds }).
// Capture complete before/after notes for those IDs and migrate callers incrementally.
// Keep full snapshots for setMidiTrackNotes replacements such as transcription, and
// preserve array ordering when undo restores deleted notes.
/** A state change that runtime can apply directly, including during undo and redo. */
type RecorderChange = {
  type: "midi-notes";
  trackId: string;
  notes: Note[];
};

export class RecorderHistory {
  private history = new UndoRedoHistory<RecorderChange>();

  constructor(private runtime: RecorderRuntime) {}

  pushMidiNotes(trackId: string, before: Note[], after: Note[]): void {
    this.history.push({
      before: { type: "midi-notes", trackId, notes: before },
      after: { type: "midi-notes", trackId, notes: after },
    });
  }

  undo(): void {
    this.history.undo((change) => this.apply(change));
  }

  redo(): void {
    this.history.redo((change) => this.apply(change));
  }

  removeMidiTrack(id: string): void {
    // Track deletion is not undoable yet, so discard changes that require it.
    this.history.prune((entry) =>
      [entry.before, entry.after].some(
        (change) => change.type === "midi-notes" && change.trackId === id,
      ),
    );
  }

  clear(): void {
    this.history.clear();
  }

  private apply(change: RecorderChange): void {
    switch (change.type) {
      case "midi-notes": {
        this.runtime.applyMidiTrackNotes(change.trackId, change.notes);
        break;
      }
    }
  }
}

/** One committed edit, with changes that restore its previous and resulting state. */
type HistoryEntry<T> = {
  before: T;
  after: T;
};

/**
 * Synchronously restore the described state and its runtime effects without recording
 * another history entry. If this throws, history keeps the entry on its original
 * stack, but cannot roll back any state the callback already changed.
 */
type ApplyChange<T> = (change: T) => void;

const MAX_HISTORY = 50;

/**
 * A chronological undo/redo history of caller-defined changes.
 * The caller owns applying changes. History stores values of T and passes them to the apply callback,
 * so entries and their referenced data must not be mutated after push or replay.
 */
class UndoRedoHistory<T> {
  private undoStack: HistoryEntry<T>[] = [];
  private redoStack: HistoryEntry<T>[] = [];

  /**
   * Record one edit after the caller has successfully applied it. Does not apply
   * either change or detect no-ops. Clears redo and retains the latest 50 edits.
   */
  push(entry: HistoryEntry<T>): void {
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
  undo(apply: ApplyChange<T>): void {
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
  redo(apply: ApplyChange<T>): void {
    const entry = this.redoStack.at(-1);
    if (!entry) {
      return;
    }
    apply(entry.after);
    this.redoStack.pop();
    this.undoStack.push(entry);
  }

  /** Remove matching entries from both stacks without applying any changes. */
  prune(matches: (entry: HistoryEntry<T>) => boolean): void {
    this.undoStack = this.undoStack.filter((entry) => !matches(entry));
    this.redoStack = this.redoStack.filter((entry) => !matches(entry));
  }

  /** Forget both stacks without changing application state, for example on project load. */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
