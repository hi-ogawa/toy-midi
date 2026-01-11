import { create } from "zustand";
import type { Note } from "../types";

// History entry types for different operations
export type HistoryEntry =
  | {
      type: "add-note";
      note: Note; // Store full note for redo
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

export interface HistoryState {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  maxHistory: number;
  isUndoing: boolean; // Flag to prevent recursive history tracking
  isRedoing: boolean;
  isInDrag: boolean; // Flag to suppress history during drag operations

  // Computed getters
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Actions
  pushOperation: (entry: HistoryEntry) => void;
  clearHistory: () => void;
  startUndo: () => void;
  endUndo: () => void;
  startRedo: () => void;
  endRedo: () => void;
  startDrag: () => void;
  endDrag: () => void;
  moveToRedo: () => void; // Move top of undo stack to redo stack
  moveToUndo: (entry: HistoryEntry) => void; // Move entry from redo to undo stack
}

const MAX_HISTORY = 50;

export const useHistoryStore = create<HistoryState>((set, get) => ({
  undoStack: [],
  redoStack: [],
  maxHistory: MAX_HISTORY,
  isUndoing: false,
  isRedoing: false,
  isInDrag: false,

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,

  pushOperation: (entry) => {
    const state = get();
    // Don't record operations during undo/redo or drag
    if (state.isUndoing || state.isRedoing || state.isInDrag) return;

    set((state) => {
      const newUndoStack = [...state.undoStack, entry];
      // Limit history depth
      if (newUndoStack.length > state.maxHistory) {
        newUndoStack.shift();
      }
      return {
        undoStack: newUndoStack,
        redoStack: [], // Clear redo stack on new operation
      };
    });
  },

  clearHistory: () => {
    set({ undoStack: [], redoStack: [] });
  },

  startUndo: () => set({ isUndoing: true }),
  endUndo: () => set({ isUndoing: false }),

  startRedo: () => set({ isRedoing: true }),
  endRedo: () => set({ isRedoing: false }),

  startDrag: () => set({ isInDrag: true }),
  endDrag: () => set({ isInDrag: false }),

  moveToRedo: () => {
    set((state) => {
      if (state.undoStack.length === 0) return state;
      const newUndoStack = [...state.undoStack];
      const entry = newUndoStack.pop()!;
      return {
        undoStack: newUndoStack,
        redoStack: [...state.redoStack, entry],
      };
    });
  },

  moveToUndo: (entry) => {
    set((state) => {
      const newRedoStack = [...state.redoStack];
      newRedoStack.pop(); // Remove the entry we're moving
      return {
        redoStack: newRedoStack,
        undoStack: [...state.undoStack, entry],
      };
    });
  },
}));
