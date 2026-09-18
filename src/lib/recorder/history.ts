/** One committed edit, with changes that restore its previous and resulting state. */
type HistoryEntry<T> = {
  before: T;
  after: T;
};

/**
 * Restore the described state and its runtime effects without recording
 * another history entry. If this throws or rejects, history keeps the entry on its original
 * stack, but cannot roll back any state the callback already changed.
 */
type ApplyChange<T> = (change: T) => void | Promise<void>;

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
   * Await apply(entry.before) for the latest edit, then move the entry to redo.
   * An empty stack is a no-op. A thrown error or rejection propagates without moving the entry.
   */
  async undo(apply: ApplyChange<T>): Promise<void> {
    const entry = this.undoStack.at(-1);
    if (!entry) {
      return;
    }
    await apply(entry.before);
    this.undoStack.pop();
    this.redoStack.push(entry);
  }

  /**
   * Await apply(entry.after) for the latest undone edit, then move the entry to undo.
   * An empty stack is a no-op. A thrown error or rejection propagates without moving the entry.
   */
  async redo(apply: ApplyChange<T>): Promise<void> {
    const entry = this.redoStack.at(-1);
    if (!entry) {
      return;
    }
    await apply(entry.after);
    this.redoStack.pop();
    this.undoStack.push(entry);
  }

  /** Forget both stacks without changing application state, for example on project load. */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
