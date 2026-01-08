import { create } from "zustand";
import { GridSnap, Note } from "../types";

interface ProjectState {
  notes: Note[];
  selectedNoteIds: Set<string>;
  gridSnap: GridSnap;
  totalBeats: number; // Timeline length in beats (default 128 = 32 bars)
  tempo: number; // BPM

  // Audio state
  audioFileName: string | null;
  audioDuration: number; // in seconds
  audioOffset: number; // in seconds - position in audio that aligns with beat 0
  isPlaying: boolean;
  playheadPosition: number; // in seconds

  // Mixer state
  audioVolume: number; // 0-1
  midiVolume: number; // 0-1
  metronomeEnabled: boolean;
  metronomeVolume: number; // 0-1

  // Waveform state
  audioPeaks: number[]; // Peak values 0-1 for waveform display
  peaksPerSecond: number; // Resolution of peaks array

  // Actions
  addNote: (note: Note) => void;
  updateNote: (id: string, updates: Partial<Omit<Note, "id">>) => void;
  deleteNotes: (ids: string[]) => void;
  selectNotes: (ids: string[], exclusive?: boolean) => void;
  deselectAll: () => void;
  setGridSnap: (snap: GridSnap) => void;
  setTotalBeats: (beats: number) => void;
  setTempo: (bpm: number) => void;

  // Audio actions
  setAudioFile: (fileName: string, duration: number) => void;
  setAudioOffset: (offset: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setPlayheadPosition: (position: number) => void;

  // Mixer actions
  setAudioVolume: (volume: number) => void;
  setMidiVolume: (volume: number) => void;
  setMetronomeEnabled: (enabled: boolean) => void;
  setMetronomeVolume: (volume: number) => void;

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
  audioDuration: 0,
  audioOffset: 0,
  isPlaying: false,
  playheadPosition: 0,

  // Mixer state
  audioVolume: 0.8,
  midiVolume: 0.8,
  metronomeEnabled: false,
  metronomeVolume: 0.5,

  // Waveform state
  audioPeaks: [],
  peaksPerSecond: 100,

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

  setTotalBeats: (beats) => set({ totalBeats: beats }),

  setTempo: (bpm) => set({ tempo: bpm }),

  // Audio actions
  setAudioFile: (fileName, duration) =>
    set({
      audioFileName: fileName,
      audioDuration: duration,
      audioOffset: 0,
      playheadPosition: 0,
    }),

  setAudioOffset: (offset) => set({ audioOffset: offset }),

  setIsPlaying: (playing) => set({ isPlaying: playing }),

  setPlayheadPosition: (position) => set({ playheadPosition: position }),

  // Mixer actions
  setAudioVolume: (volume) => set({ audioVolume: volume }),
  setMidiVolume: (volume) => set({ midiVolume: volume }),
  setMetronomeEnabled: (enabled) => set({ metronomeEnabled: enabled }),
  setMetronomeVolume: (volume) => set({ metronomeVolume: volume }),

  // Waveform actions
  setAudioPeaks: (peaks, peaksPerSecond) =>
    set({ audioPeaks: peaks, peaksPerSecond }),
}));

// Helper: convert seconds to beats
export function secondsToBeats(seconds: number, tempo: number): number {
  return (seconds / 60) * tempo;
}

// Helper: convert beats to seconds
export function beatsToSeconds(beats: number, tempo: number): number {
  return (beats / tempo) * 60;
}
