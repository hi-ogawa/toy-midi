const MAX_HISTORY = 50;

export type RecorderHistoryEntry = {
  undo: () => void;
  redo: () => void;
};

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

  undo(): void {
    const entry = this.undoStack.at(-1);
    if (!entry) {
      return;
    }
    entry.undo();
    this.undoStack.pop();
    this.redoStack.push(entry);
  }

  redo(): void {
    const entry = this.redoStack.at(-1);
    if (!entry) {
      return;
    }
    entry.redo();
    this.redoStack.pop();
    this.undoStack.push(entry);
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
