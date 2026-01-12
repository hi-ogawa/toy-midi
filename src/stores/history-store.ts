import type { Note } from "../types";

// History entry types for different operations
export type HistoryEntry =
  | {
      type: "add-note";
      note: Note; // Store full note for redo
    }
  | {
      type: "add-notes";
      notes: Note[]; // Batch add for paste operation
    }
  | {
      type: "delete-notes";
      notes: Note[]; // Store deleted notes for undo
    }
  | {
      type: "update-notes";
      updates: Array<{
        id: string;
        before: Partial<Omit<Note, "id">>;
        after: Partial<Omit<Note, "id">>;
      }>;
    };

const MAX_HISTORY = 50;

// Simple history store - not a Zustand store since it's only used internally
// by project-store, not subscribed to by React components
export const historyStore = {
  undoStack: [] as HistoryEntry[],
  redoStack: [] as HistoryEntry[],
  isUndoing: false,
  isRedoing: false,
  isInDrag: false,

  canUndo(): boolean {
    return this.undoStack.length > 0;
  },

  canRedo(): boolean {
    return this.redoStack.length > 0;
  },

  pushOperation(entry: HistoryEntry): void {
    // Don't record operations during undo/redo or drag
    if (this.isUndoing || this.isRedoing || this.isInDrag) return;

    this.undoStack.push(entry);
    // Limit history depth
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }
    // Clear redo stack on new operation
    this.redoStack = [];
  },

  clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
  },

  startUndo(): void {
    this.isUndoing = true;
  },
  endUndo(): void {
    this.isUndoing = false;
  },

  startRedo(): void {
    this.isRedoing = true;
  },
  endRedo(): void {
    this.isRedoing = false;
  },

  startDrag(): void {
    this.isInDrag = true;
  },
  endDrag(): void {
    this.isInDrag = false;
  },

  moveToRedo(): void {
    const entry = this.undoStack.pop();
    if (entry) {
      this.redoStack.push(entry);
    }
  },

  moveToUndo(entry: HistoryEntry): void {
    this.redoStack.pop(); // Remove the entry we're moving
    this.undoStack.push(entry);
  },
};
