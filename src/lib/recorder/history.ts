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
export class UndoRedoHistory<T> {
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
