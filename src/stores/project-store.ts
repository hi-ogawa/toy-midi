import { create } from "zustand";
import { GridSnap, Note } from "../types";

interface ProjectState {
  notes: Note[];
  selectedNoteIds: Set<string>;
  gridSnap: GridSnap;

  // Actions
  addNote: (note: Note) => void;
  updateNote: (id: string, updates: Partial<Omit<Note, "id">>) => void;
  deleteNotes: (ids: string[]) => void;
  selectNotes: (ids: string[], exclusive?: boolean) => void;
  deselectAll: () => void;
  setGridSnap: (snap: GridSnap) => void;
}

let noteIdCounter = 0;
export function generateNoteId(): string {
  return `note-${++noteIdCounter}`;
}

export const useProjectStore = create<ProjectState>((set) => ({
  notes: [],
  selectedNoteIds: new Set(),
  gridSnap: "1/8",

  addNote: (note) =>
    set((state) => ({
      notes: [...state.notes, note],
    })),

  updateNote: (id, updates) =>
    set((state) => ({
      notes: state.notes.map((n) => (n.id === id ? { ...n, ...updates } : n)),
    })),

  deleteNotes: (ids) =>
    set((state) => {
      const idsSet = new Set(ids);
      const newSelected = new Set(state.selectedNoteIds);
      ids.forEach((id) => newSelected.delete(id));
      return {
        notes: state.notes.filter((n) => !idsSet.has(n.id)),
        selectedNoteIds: newSelected,
      };
    }),

  selectNotes: (ids, exclusive = true) =>
    set((state) => {
      if (exclusive) {
        return { selectedNoteIds: new Set(ids) };
      }
      const newSelected = new Set(state.selectedNoteIds);
      ids.forEach((id) => newSelected.add(id));
      return { selectedNoteIds: newSelected };
    }),

  deselectAll: () => set({ selectedNoteIds: new Set() }),

  setGridSnap: (snap) => set({ gridSnap: snap }),
}));
