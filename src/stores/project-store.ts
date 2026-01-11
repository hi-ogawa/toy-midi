import { create } from "zustand";
import { GridSnap, Note } from "../types";
import { useHistoryStore } from "./history-store";

export interface ProjectState {
  // project
  totalBeats: number; // Timeline length in beats (default 128 = 32 bars)
  tempo: number; // BPM

  // Midi track
  notes: Note[];

  // Midi editor state
  selectedNoteIds: Set<string>;
  gridSnap: GridSnap;

  // Audio track
  audioFileName: string | null;
  audioAssetKey: string | null; // Reference to IndexedDB asset
  audioDuration: number; // in seconds
  audioOffset: number; // in seconds - timeline position where audio starts (>= 0)

  // Mixer state
  audioVolume: number; // 0-1
  midiVolume: number; // 0-1
  metronomeEnabled: boolean;
  metronomeVolume: number; // 0-1

  // UI state
  showDebug: boolean;
  autoScrollEnabled: boolean;

  // Viewport state
  // scrollX/scrollY: content offset in logical units (beats/semitones), can be fractional
  // pixelsPerBeat/pixelsPerKey: scale factors (content units → screen pixels)
  //   currently fractional (×0.9/×1.1 per step), rounded at render time
  //   TODO: consider discrete levels for simpler state and guaranteed roundtrip
  scrollX: number; // horizontal offset: leftmost visible beat (0 = start)
  scrollY: number; // vertical offset: rows scrolled from top (0 = C8 at top)
  pixelsPerBeat: number; // horizontal scale: screen pixels per beat
  pixelsPerKey: number; // vertical scale: screen pixels per semitone row
  waveformHeight: number; // resizable waveform area height in pixels

  // Waveform state
  audioPeaks: number[]; // Peak values 0-1 for waveform display
  peaksPerSecond: number; // Resolution of peaks array

  // Actions
  addNote: (note: Note) => void;
  updateNote: (id: string, updates: Partial<Omit<Note, "id">>) => void;
  updateNotes: (
    updates: Array<{ id: string; changes: Partial<Omit<Note, "id">> }>,
  ) => void; // Batch update for history tracking
  updateNotesWithHistory: (
    updates: Array<{
      id: string;
      before: Partial<Omit<Note, "id">>;
      after: Partial<Omit<Note, "id">>;
    }>,
  ) => void; // Update with explicit before/after for drag operations
  deleteNotes: (ids: string[]) => void;
  selectNotes: (ids: string[], exclusive?: boolean) => void;
  deselectAll: () => void;
  setGridSnap: (snap: GridSnap) => void;
  setTotalBeats: (beats: number) => void;
  setTempo: (bpm: number) => void;

  // Undo/Redo actions
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Audio actions
  setAudioFile: (fileName: string, duration: number, assetKey: string) => void;
  setAudioOffset: (offset: number) => void;

  // Mixer actions
  setAudioVolume: (volume: number) => void;
  setMidiVolume: (volume: number) => void;
  setMetronomeEnabled: (enabled: boolean) => void;
  setMetronomeVolume: (volume: number) => void;

  // UI actions
  setShowDebug: (show: boolean) => void;
  setAutoScrollEnabled: (enabled: boolean) => void;

  // Viewport actions
  setScrollX: (scrollX: number) => void;
  setScrollY: (scrollY: number) => void;
  setPixelsPerBeat: (pixelsPerBeat: number) => void;
  setPixelsPerKey: (pixelsPerKey: number) => void;
  setWaveformHeight: (height: number) => void;

  // Waveform actions
  setAudioPeaks: (peaks: number[], peaksPerSecond: number) => void;
}

let noteIdCounter = 0;
export function generateNoteId(): string {
  return `note-${++noteIdCounter}`;
}

export const useProjectStore = create<ProjectState>((set) => ({
  notes: [],
  selectedNoteIds: new Set(),
  gridSnap: "1/8",
  totalBeats: 640, // 160 bars (~5 min at 120 BPM)
  tempo: 120,

  // Audio state
  audioFileName: null,
  audioAssetKey: null,
  audioDuration: 0,
  audioOffset: 0,

  // Mixer state
  audioVolume: 0.8,
  midiVolume: 0.8,
  metronomeEnabled: false,
  metronomeVolume: 0.5,

  // UI state
  showDebug: false,
  autoScrollEnabled: true,

  // Viewport state (defaults match piano-roll.tsx)
  scrollX: 0,
  scrollY: 72, // MAX_PITCH (127) - DEFAULT_VIEW_MAX_PITCH (55)
  pixelsPerBeat: 80, // DEFAULT_PIXELS_PER_BEAT
  pixelsPerKey: 20, // DEFAULT_PIXELS_PER_KEY
  waveformHeight: 60, // DEFAULT_WAVEFORM_HEIGHT

  // Waveform state
  audioPeaks: [],
  peaksPerSecond: 100,

  addNote: (note) => {
    // Track in history
    const historyStore = useHistoryStore.getState();
    historyStore.pushOperation({
      type: "add-note",
      note: { ...note }, // Store a copy
    });

    set((state) => ({
      notes: [...state.notes, note],
    }));
  },

  updateNote: (id, updates) => {
    const state = useProjectStore.getState();
    const note = state.notes.find((n) => n.id === id);
    if (!note) return;

    // Track in history (only changed fields)
    const historyStore = useHistoryStore.getState();
    const before: Partial<Omit<Note, "id">> = {};
    const after: Partial<Omit<Note, "id">> = {};
    for (const key of Object.keys(updates) as Array<keyof typeof updates>) {
      before[key] = note[key];
      after[key] = updates[key]!;
    }
    historyStore.pushOperation({
      type: "update-notes",
      updates: [{ id, before, after }],
    });

    set((state) => ({
      notes: state.notes.map((n) => (n.id === id ? { ...n, ...updates } : n)),
    }));
  },

  updateNotes: (updates) => {
    const state = useProjectStore.getState();
    const historyStore = useHistoryStore.getState();

    // Build history entry with before and after state
    const historyUpdates = updates
      .map(({ id, changes }) => {
        const note = state.notes.find((n) => n.id === id);
        if (!note) return null;

        const before: Partial<Omit<Note, "id">> = {};
        const after: Partial<Omit<Note, "id">> = {};
        for (const key of Object.keys(changes) as Array<keyof typeof changes>) {
          before[key] = note[key];
          after[key] = changes[key]!;
        }
        return { id, before, after };
      })
      .filter((u) => u !== null);

    if (historyUpdates.length > 0) {
      historyStore.pushOperation({
        type: "update-notes",
        updates: historyUpdates,
      });
    }

    // Apply updates
    set((state) => {
      const updatesMap = new Map(updates.map((u) => [u.id, u.changes]));
      return {
        notes: state.notes.map((n) =>
          updatesMap.has(n.id) ? { ...n, ...updatesMap.get(n.id)! } : n,
        ),
      };
    });
  },

  updateNotesWithHistory: (updates) => {
    const historyStore = useHistoryStore.getState();

    // Push history entry with provided before/after
    if (updates.length > 0) {
      historyStore.pushOperation({
        type: "update-notes",
        updates: updates,
      });
    }

    // Apply after state
    set((state) => {
      const updatesMap = new Map(updates.map((u) => [u.id, u.after]));
      return {
        notes: state.notes.map((n) =>
          updatesMap.has(n.id) ? { ...n, ...updatesMap.get(n.id)! } : n,
        ),
      };
    });
  },

  deleteNotes: (ids) => {
    const state = useProjectStore.getState();

    // Track in history (save deleted notes)
    const historyStore = useHistoryStore.getState();
    const deletedNotes = state.notes.filter((n) => ids.includes(n.id));
    if (deletedNotes.length > 0) {
      historyStore.pushOperation({
        type: "delete-notes",
        notes: deletedNotes,
      });
    }

    set((state) => {
      const idsSet = new Set(ids);
      const newSelected = new Set(state.selectedNoteIds);
      ids.forEach((id) => newSelected.delete(id));
      return {
        notes: state.notes.filter((n) => !idsSet.has(n.id)),
        selectedNoteIds: newSelected,
      };
    });
  },

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

  setTotalBeats: (beats) => set({ totalBeats: beats }),

  setTempo: (bpm) => set({ tempo: bpm }),

  // Audio actions
  setAudioFile: (fileName, duration, assetKey) =>
    set({
      audioFileName: fileName,
      audioAssetKey: assetKey,
      audioDuration: duration,
      audioOffset: 0,
    }),

  setAudioOffset: (offset) => set({ audioOffset: offset }),

  // Mixer actions
  setAudioVolume: (volume) => set({ audioVolume: volume }),
  setMidiVolume: (volume) => set({ midiVolume: volume }),
  setMetronomeEnabled: (enabled) => set({ metronomeEnabled: enabled }),
  setMetronomeVolume: (volume) => set({ metronomeVolume: volume }),

  // UI actions
  setShowDebug: (show) => set({ showDebug: show }),
  setAutoScrollEnabled: (enabled) => set({ autoScrollEnabled: enabled }),

  // Viewport actions
  setScrollX: (scrollX) => set({ scrollX }),
  setScrollY: (scrollY) => set({ scrollY }),
  setPixelsPerBeat: (pixelsPerBeat) => set({ pixelsPerBeat }),
  setPixelsPerKey: (pixelsPerKey) => set({ pixelsPerKey }),
  setWaveformHeight: (height) => set({ waveformHeight: height }),

  // Waveform actions
  setAudioPeaks: (peaks, peaksPerSecond) =>
    set({ audioPeaks: peaks, peaksPerSecond }),

  // Undo/Redo actions
  undo: () => {
    const historyStore = useHistoryStore.getState();
    if (!historyStore.canUndo()) return;

    const entry = historyStore.undoStack[historyStore.undoStack.length - 1];

    historyStore.startUndo();

    try {
      if (entry.type === "add-note") {
        // Undo add: remove the note
        set((state) => ({
          notes: state.notes.filter((n) => n.id !== entry.note.id),
        }));
      } else if (entry.type === "delete-notes") {
        // Undo delete: restore the notes
        set((state) => ({
          notes: [...state.notes, ...entry.notes],
        }));
      } else if (entry.type === "update-notes") {
        // Undo update: restore previous values
        set((state) => {
          const updatesMap = new Map(
            entry.updates.map((u) => [u.id, u.before]),
          );
          return {
            notes: state.notes.map((n) =>
              updatesMap.has(n.id) ? { ...n, ...updatesMap.get(n.id)! } : n,
            ),
          };
        });
      }

      historyStore.moveToRedo();
    } finally {
      historyStore.endUndo();
    }
  },

  redo: () => {
    const historyStore = useHistoryStore.getState();
    if (!historyStore.canRedo()) return;

    const redoStack = historyStore.redoStack;
    const entry = redoStack[redoStack.length - 1];

    historyStore.startRedo();

    try {
      if (entry.type === "add-note") {
        // Redo add: re-add the note
        set((state) => ({
          notes: [...state.notes, entry.note],
        }));
      } else if (entry.type === "delete-notes") {
        // Redo delete: remove the notes again
        const ids = entry.notes.map((n) => n.id);
        set((state) => ({
          notes: state.notes.filter((n) => !ids.includes(n.id)),
        }));
      } else if (entry.type === "update-notes") {
        // Redo update: apply after state
        set((state) => {
          const updatesMap = new Map(entry.updates.map((u) => [u.id, u.after]));
          return {
            notes: state.notes.map((n) =>
              updatesMap.has(n.id) ? { ...n, ...updatesMap.get(n.id)! } : n,
            ),
          };
        });
      }

      // Move from redo to undo stack using proper store method
      useHistoryStore.setState({
        redoStack: redoStack.slice(0, -1),
        undoStack: [...historyStore.undoStack, entry],
      });
    } finally {
      historyStore.endRedo();
    }
  },

  canUndo: () => useHistoryStore.getState().canUndo(),
  canRedo: () => useHistoryStore.getState().canRedo(),
}));

// Helper: convert seconds to beats
export function secondsToBeats(seconds: number, tempo: number): number {
  return (seconds / 60) * tempo;
}

// Helper: convert beats to seconds
export function beatsToSeconds(beats: number, tempo: number): number {
  return (beats / tempo) * 60;
}

// === Project Persistence ===

const STORAGE_KEY = "toy-midi-project";
const STORAGE_VERSION = 1;

interface SavedProject {
  version: number;
  notes: Note[];
  tempo: number;
  gridSnap: GridSnap;
  audioFileName: string | null;
  audioAssetKey: string | null; // Reference to IndexedDB asset
  audioDuration: number;
  audioOffset: number;
  audioVolume: number;
  midiVolume: number;
  metronomeEnabled: boolean;
  metronomeVolume: number;
  autoScrollEnabled?: boolean;
  // Viewport state
  scrollX?: number;
  scrollY?: number;
  pixelsPerBeat?: number;
  pixelsPerKey?: number;
  waveformHeight?: number;
}

export function saveProject(): void {
  const state = useProjectStore.getState();
  const saved: SavedProject = {
    version: STORAGE_VERSION,
    notes: state.notes,
    tempo: state.tempo,
    gridSnap: state.gridSnap,
    audioFileName: state.audioFileName,
    audioAssetKey: state.audioAssetKey,
    audioDuration: state.audioDuration,
    audioOffset: state.audioOffset,
    audioVolume: state.audioVolume,
    midiVolume: state.midiVolume,
    metronomeEnabled: state.metronomeEnabled,
    metronomeVolume: state.metronomeVolume,
    autoScrollEnabled: state.autoScrollEnabled,
    // Viewport state
    scrollX: state.scrollX,
    scrollY: state.scrollY,
    pixelsPerBeat: state.pixelsPerBeat,
    pixelsPerKey: state.pixelsPerKey,
    waveformHeight: state.waveformHeight,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch (e) {
    console.warn("Failed to save project:", e);
  }
}

// Default values for new/missing fields
const DEFAULTS: Omit<SavedProject, "version"> = {
  notes: [],
  tempo: 120,
  gridSnap: "1/8",
  audioFileName: null,
  audioAssetKey: null,
  audioDuration: 0,
  audioOffset: 0,
  audioVolume: 0.8,
  midiVolume: 0.8,
  metronomeEnabled: false,
  metronomeVolume: 0.5,
  autoScrollEnabled: true,
  // Viewport state defaults
  scrollX: 0,
  scrollY: 72, // MAX_PITCH (127) - DEFAULT_VIEW_MAX_PITCH (55)
  pixelsPerBeat: 80,
  pixelsPerKey: 20,
  waveformHeight: 60,
};

// Expose store for E2E testing in dev mode
export function exposeStoreForE2E(): void {
  if (import.meta.env.DEV) {
    (window as Window & { __store?: typeof useProjectStore }).__store =
      useProjectStore;
  }
}

export function hasSavedProject(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

export function clearProject(): void {
  localStorage.removeItem(STORAGE_KEY);
  useProjectStore.setState({
    ...DEFAULTS,
    selectedNoteIds: new Set(),
    audioPeaks: [],
    peaksPerSecond: 100,
    totalBeats: 640,
    showDebug: false,
    autoScrollEnabled: true,
  });
  // Clear undo/redo history
  useHistoryStore.getState().clearHistory();
}

export function loadProject() {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (!json) return null;

    const saved = JSON.parse(json) as Partial<SavedProject>;

    // Version check: only reject if major breaking change
    // For now, version 1 is compatible with missing fields
    if (saved.version && saved.version > STORAGE_VERSION) {
      console.warn("Project from newer version, some data may be lost");
    }

    // Merge with defaults (handles new fields gracefully)
    const merged = { ...DEFAULTS, ...saved };

    // Update note ID counter to avoid collisions
    const maxId = merged.notes.reduce((max, n) => {
      const match = n.id.match(/^note-(\d+)$/);
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, 0);
    noteIdCounter = maxId;

    useProjectStore.setState({
      notes: merged.notes,
      tempo: merged.tempo,
      gridSnap: merged.gridSnap,
      audioFileName: merged.audioFileName,
      audioAssetKey: merged.audioAssetKey,
      audioDuration: merged.audioDuration,
      audioOffset: merged.audioOffset,
      audioVolume: merged.audioVolume,
      midiVolume: merged.midiVolume,
      metronomeEnabled: merged.metronomeEnabled,
      metronomeVolume: merged.metronomeVolume,
      autoScrollEnabled:
        merged.autoScrollEnabled ?? DEFAULTS.autoScrollEnabled!,
      // Viewport state
      scrollX: merged.scrollX ?? DEFAULTS.scrollX!,
      scrollY: merged.scrollY ?? DEFAULTS.scrollY!,
      pixelsPerBeat: merged.pixelsPerBeat ?? DEFAULTS.pixelsPerBeat!,
      pixelsPerKey: merged.pixelsPerKey ?? DEFAULTS.pixelsPerKey!,
      waveformHeight: merged.waveformHeight ?? DEFAULTS.waveformHeight!,
      // Reset transient state
      selectedNoteIds: new Set(),
      audioPeaks: [],
    });

    // Clear undo/redo history on project load
    useHistoryStore.getState().clearHistory();
  } catch (e) {
    console.warn("Failed to load project:", e);
    return null;
  }
}
