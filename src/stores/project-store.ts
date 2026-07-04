import { create } from "zustand";
import type { AudioView } from "../lib/audio-view";
import type { GridSnap, Locator, Note, TimeSignature } from "../types";
import { historyStore } from "./history-store";

// Maximum number of audio tracks (e.g. for stem-split transcription)
export const MAX_AUDIO_TRACKS = 2;

// Persisted audio track fields
export interface SavedAudioTrack {
  id: string;
  fileName: string;
  assetKey: string; // Reference to IndexedDB asset
  duration: number; // in seconds
  offset: number; // in seconds - timeline position where audio starts (>= 0)
  volume: number; // 0-1
  muted: boolean;
}

// Runtime audio track: persisted fields plus transient waveform data
export type AudioTrack = SavedAudioTrack & {
  audioView: AudioView | null; // Pre-computed waveform data (not persisted)
};

export interface ProjectState {
  // project
  totalBeats: number; // Timeline length in beats (default 128 = 32 bars)
  tempo: number; // BPM
  timeSignature: TimeSignature; // Time signature (default 4/4)

  // Midi track
  notes: Note[];

  // Midi editor state
  selectedNoteIds: Set<string>;
  gridSnap: GridSnap;
  clipboard: Note[]; // Copied notes (not persisted)

  // Locators (section markers)
  locators: Locator[];
  selectedLocatorId: string | null;

  // Audio tracks (up to MAX_AUDIO_TRACKS)
  audioTracks: AudioTrack[];
  selectedAudioTrackId: string | null; // not persisted

  // Mixer state
  midiVolume: number; // 0-1
  midiMuted: boolean;
  midiProgram: number; // GM program number 0-127
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
  waveformHeight: number; // resizable waveform lane height in pixels (per track)

  // Actions
  addNote: (note: Note) => void;
  updateNote: (id: string, updates: Partial<Omit<Note, "id">>) => void;
  updateNotes: (
    updates: Array<{ id: string; changes: Partial<Omit<Note, "id">> }>,
  ) => void; // Batch update for history tracking
  deleteNotes: (ids: string[]) => void;
  selectNotes: (ids: string[], exclusive?: boolean) => void;
  deselectAll: () => void;
  setGridSnap: (snap: GridSnap) => void;
  setTotalBeats: (beats: number) => void;
  setTempo: (bpm: number) => void;
  setTimeSignature: (timeSignature: TimeSignature) => void;

  // Locator actions
  addLocator: (locator: Locator) => void;
  updateLocator: (id: string, updates: Partial<Omit<Locator, "id">>) => void;
  deleteLocator: (id: string) => void;
  selectLocator: (id: string | null) => void;

  // Undo/Redo actions
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Copy/Paste actions
  copyNotes: () => void;
  pasteNotes: (insertBeat: number) => void;

  // Audio track actions (id-based)
  addAudioTrack: (track: AudioTrack) => void;
  updateAudioTrack: (
    id: string,
    updates: Partial<Omit<AudioTrack, "id">>,
  ) => void;
  deleteAudioTrack: (id: string) => void;
  selectAudioTrack: (id: string | null) => void;

  // Mixer actions
  setMidiVolume: (volume: number) => void;
  setMidiMuted: (muted: boolean) => void;
  setMidiProgram: (program: number) => void;
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
}

let noteIdCounter = 0;
export function generateNoteId(): string {
  return `note-${++noteIdCounter}`;
}

let locatorIdCounter = 0;
export function generateLocatorId(): string {
  return `locator-${++locatorIdCounter}`;
}

let audioTrackIdCounter = 0;
export function generateAudioTrackId(): string {
  return `audio-${++audioTrackIdCounter}`;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  notes: [],
  selectedNoteIds: new Set(),
  gridSnap: "1/8",
  clipboard: [], // Clipboard for copied notes (not persisted to storage)
  totalBeats: 640, // 160 bars (~5 min at 120 BPM)
  tempo: 120,
  timeSignature: { numerator: 4, denominator: 4 }, // 4/4 time

  // Locator state
  locators: [],
  selectedLocatorId: null,

  // Audio state
  audioTracks: [],
  selectedAudioTrackId: null,

  // Mixer state
  midiVolume: 0.8,
  midiMuted: false,
  midiProgram: 0, // Acoustic Grand Piano
  metronomeEnabled: false,
  metronomeVolume: 0.5,

  // UI state
  showDebug: false,
  autoScrollEnabled: true,

  // Viewport state (defaults match piano-roll.tsx)
  scrollX: 0,
  scrollY: 51, // MAX_PITCH (127) - DEFAULT_VIEW_MAX_PITCH (76)
  pixelsPerBeat: 80, // DEFAULT_PIXELS_PER_BEAT
  pixelsPerKey: 20, // DEFAULT_PIXELS_PER_KEY
  waveformHeight: 60, // DEFAULT_WAVEFORM_HEIGHT

  addNote: (note) => {
    // Track in history
    historyStore.pushOperation({
      type: "add-note",
      note,
    });

    set((state) => ({
      notes: [...state.notes, note],
    }));
  },

  updateNote: (id, updates) => {
    const state = get();
    const note = state.notes.find((n) => n.id === id);
    if (!note) {
      return;
    }

    // Track in history (only changed fields)
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
    const state = get();

    // Build history entry with before and after state
    const historyUpdates = updates
      .map(({ id, changes }) => {
        const note = state.notes.find((n) => n.id === id);
        if (!note) {
          return null;
        }

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

  deleteNotes: (ids) => {
    const state = get();

    // Track in history (save deleted notes)
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
      for (const id of ids) {
        newSelected.delete(id);
      }
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
      for (const id of ids) {
        newSelected.add(id);
      }
      return { selectedNoteIds: newSelected };
    }),

  deselectAll: () => set({ selectedNoteIds: new Set() }),

  setGridSnap: (snap) => set({ gridSnap: snap }),

  setTotalBeats: (beats) => set({ totalBeats: beats }),

  setTempo: (bpm) => set({ tempo: bpm }),

  setTimeSignature: (timeSignature) => set({ timeSignature }),

  // Locator actions
  addLocator: (locator) =>
    set((state) => ({
      locators: [...state.locators, locator],
    })),

  updateLocator: (id, updates) =>
    set((state) => ({
      locators: state.locators.map((l) =>
        l.id === id ? { ...l, ...updates } : l,
      ),
    })),

  deleteLocator: (id) =>
    set((state) => ({
      locators: state.locators.filter((l) => l.id !== id),
      selectedLocatorId:
        state.selectedLocatorId === id ? null : state.selectedLocatorId,
    })),

  selectLocator: (id) => set({ selectedLocatorId: id }),

  // Audio track actions
  addAudioTrack: (track) =>
    set((state) =>
      state.audioTracks.length >= MAX_AUDIO_TRACKS
        ? state
        : { audioTracks: [...state.audioTracks, track] },
    ),

  updateAudioTrack: (id, updates) =>
    set((state) => ({
      audioTracks: state.audioTracks.map((t) =>
        t.id === id ? { ...t, ...updates } : t,
      ),
    })),

  deleteAudioTrack: (id) =>
    set((state) => ({
      audioTracks: state.audioTracks.filter((t) => t.id !== id),
      selectedAudioTrackId:
        state.selectedAudioTrackId === id ? null : state.selectedAudioTrackId,
    })),

  selectAudioTrack: (id) => set({ selectedAudioTrackId: id }),

  // Mixer actions
  setMidiVolume: (volume) => set({ midiVolume: volume }),
  setMidiMuted: (muted) => set({ midiMuted: muted }),
  setMidiProgram: (program) => set({ midiProgram: program }),
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

  // Undo/Redo actions
  undo: () => {
    if (!historyStore.canUndo()) {
      return;
    }

    const entry = historyStore.undoStack[historyStore.undoStack.length - 1];

    historyStore.startUndo();

    try {
      if (entry.type === "add-note") {
        // Undo add: remove the note
        set((state) => ({
          notes: state.notes.filter((n) => n.id !== entry.note.id),
        }));
      } else if (entry.type === "add-notes") {
        // Undo batch add: remove all the notes
        const noteIds = entry.notes.map((n) => n.id);
        set((state) => ({
          notes: state.notes.filter((n) => !noteIds.includes(n.id)),
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
    if (!historyStore.canRedo()) {
      return;
    }

    const entry = historyStore.redoStack[historyStore.redoStack.length - 1];

    historyStore.startRedo();

    try {
      if (entry.type === "add-note") {
        // Redo add: re-add the note
        set((state) => ({
          notes: [...state.notes, entry.note],
        }));
      } else if (entry.type === "add-notes") {
        // Redo batch add: re-add all the notes
        set((state) => ({
          notes: [...state.notes, ...entry.notes],
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

      // Move from redo to undo stack
      historyStore.moveToUndo(entry);
    } finally {
      historyStore.endRedo();
    }
  },

  canUndo: () => historyStore.canUndo(),
  canRedo: () => historyStore.canRedo(),

  // Copy/Paste actions
  copyNotes: () => {
    const state = get();
    // Copy selected notes to clipboard
    const selectedNotes = state.notes.filter((n) =>
      state.selectedNoteIds.has(n.id),
    );
    if (selectedNotes.length === 0) {
      return;
    }

    // Create new object instances to avoid reference issues when pasting
    set({
      clipboard: selectedNotes.map((n) => ({ ...n })),
    });
  },

  pasteNotes: (insertBeat: number) => {
    const state = get();
    if (state.clipboard.length === 0) {
      return;
    }

    // Find the earliest start time in clipboard to calculate offset
    const minStart = Math.min(...state.clipboard.map((n) => n.start));
    const pasteOffset = insertBeat - minStart;

    // Create new notes with new IDs and offset positions
    const newNotes = state.clipboard.map((n) => ({
      ...n,
      id: generateNoteId(),
      start: n.start + pasteOffset,
    }));

    // Track in history as a batch operation
    historyStore.pushOperation({
      type: "add-notes",
      notes: newNotes,
    });

    // Add notes and select them
    set((state) => ({
      notes: [...state.notes, ...newNotes],
      selectedNoteIds: new Set(newNotes.map((n) => n.id)),
    }));
  },
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

const STORAGE_VERSION = 2;

export interface SavedProject {
  version: 2;
  notes: Note[];
  tempo: number;
  timeSignature?: TimeSignature; // Optional for backward compatibility
  gridSnap: GridSnap;
  locators?: Locator[]; // Optional for backward compatibility
  audioTracks: SavedAudioTrack[];
  midiVolume: number;
  midiMuted?: boolean; // Optional for backward compatibility
  midiProgram?: number; // Optional for backward compatibility
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

export type SavedProjectV1 = Omit<SavedProject, "version" | "audioTracks"> & {
  version: 1;
  audioFileName: string | null;
  audioAssetKey: string | null;
  audioDuration: number;
  audioOffset: number;
  audioVolume: number;
  audioMuted?: boolean; // Optional for backward compatibility
};

export type AnySavedProject = SavedProjectV1 | SavedProject;

// Default values for new/missing fields
const DEFAULTS: Omit<SavedProject, "version"> = {
  notes: [],
  tempo: 120,
  timeSignature: { numerator: 4, denominator: 4 }, // Default 4/4 time
  gridSnap: "1/8",
  locators: [],
  audioTracks: [],
  midiVolume: 0.8,
  midiMuted: false,
  midiProgram: 0,
  metronomeEnabled: false,
  metronomeVolume: 0.5,
  autoScrollEnabled: true,
  // Viewport state defaults
  scrollX: 0,
  scrollY: 51, // MAX_PITCH (127) - DEFAULT_VIEW_MAX_PITCH (76)
  pixelsPerBeat: 80,
  pixelsPerKey: 20,
  waveformHeight: 60,
};

// Pure serialization: ProjectState -> SavedProject
export function toSavedProject(state: ProjectState): SavedProject {
  return {
    version: STORAGE_VERSION,
    notes: state.notes,
    tempo: state.tempo,
    timeSignature: state.timeSignature,
    gridSnap: state.gridSnap,
    locators: state.locators,
    audioTracks: state.audioTracks.map(
      // Strip transient waveform data
      ({ audioView: _audioView, ...track }) => track,
    ),
    midiVolume: state.midiVolume,
    midiMuted: state.midiMuted,
    midiProgram: state.midiProgram,
    metronomeEnabled: state.metronomeEnabled,
    metronomeVolume: state.metronomeVolume,
    autoScrollEnabled: state.autoScrollEnabled,
    scrollX: state.scrollX,
    scrollY: state.scrollY,
    pixelsPerBeat: state.pixelsPerBeat,
    pixelsPerKey: state.pixelsPerKey,
    waveformHeight: state.waveformHeight,
  };
}

// Pure deserialization: SavedProject -> Partial<ProjectState>
export function fromSavedProject(data: AnySavedProject): Partial<ProjectState> {
  // Version check: only reject if major breaking change
  if (data.version > STORAGE_VERSION) {
    console.warn("Project from newer version, some data may be lost");
  }

  // Merge with defaults (handles new fields gracefully)
  const merged = { ...DEFAULTS, ...data };

  // Update note ID counter to avoid collisions
  const maxId = merged.notes.reduce((max, n) => {
    const match = n.id.match(/^note-(\d+)$/);
    return match ? Math.max(max, Number.parseInt(match[1], 10)) : max;
  }, 0);
  noteIdCounter = maxId;

  // Update locator ID counter to avoid collisions
  const maxLocatorId = (merged.locators ?? []).reduce((max, l) => {
    const match = l.id.match(/^locator-(\d+)$/);
    return match ? Math.max(max, Number.parseInt(match[1], 10)) : max;
  }, 0);
  locatorIdCounter = maxLocatorId;

  const savedAudioTracks: SavedAudioTrack[] =
    data.version === 2
      ? data.audioTracks
      : data.audioFileName && data.audioAssetKey
        ? [
            {
              id: "audio-1",
              fileName: data.audioFileName,
              assetKey: data.audioAssetKey,
              duration: data.audioDuration,
              offset: data.audioOffset,
              volume: data.audioVolume,
              muted: data.audioMuted ?? false,
            },
          ]
        : [];

  // Update audio track ID counter to avoid collisions
  audioTrackIdCounter = savedAudioTracks.reduce((max, t) => {
    const match = t.id.match(/^audio-(\d+)$/);
    return match ? Math.max(max, Number.parseInt(match[1], 10)) : max;
  }, 0);

  return {
    notes: merged.notes,
    tempo: merged.tempo,
    timeSignature: merged.timeSignature ?? DEFAULTS.timeSignature,
    gridSnap: merged.gridSnap,
    locators: merged.locators ?? DEFAULTS.locators,
    // Reattach transient waveform data slot (loaded lazily on project open)
    audioTracks: savedAudioTracks.map((t) => ({ ...t, audioView: null })),
    midiVolume: merged.midiVolume,
    midiMuted: merged.midiMuted ?? DEFAULTS.midiMuted,
    midiProgram: merged.midiProgram ?? DEFAULTS.midiProgram,
    metronomeEnabled: merged.metronomeEnabled,
    metronomeVolume: merged.metronomeVolume,
    autoScrollEnabled: merged.autoScrollEnabled ?? DEFAULTS.autoScrollEnabled,
    scrollX: merged.scrollX ?? DEFAULTS.scrollX,
    scrollY: merged.scrollY ?? DEFAULTS.scrollY,
    pixelsPerBeat: merged.pixelsPerBeat ?? DEFAULTS.pixelsPerBeat,
    pixelsPerKey: merged.pixelsPerKey ?? DEFAULTS.pixelsPerKey,
    waveformHeight: merged.waveformHeight ?? DEFAULTS.waveformHeight,
    // Reset transient state
    selectedNoteIds: new Set(),
    selectedLocatorId: null,
    selectedAudioTrackId: null,
  };
}

// Expose store for E2E testing in dev mode
export function exposeStoreForE2E(): void {
  if (import.meta.env.DEV) {
    (window as Window & { __store?: typeof useProjectStore }).__store =
      useProjectStore;
  }
}
