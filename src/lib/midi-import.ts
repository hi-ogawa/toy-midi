// MIDI file import using @tonejs/midi

import { Midi } from "@tonejs/midi";
import { generateNoteId } from "../stores/project-store";
import type { Note, TimeSignature } from "../types";

export interface ParsedMidiTrack {
  index: number;
  name: string;
  noteCount: number;
  instrument?: string;
}

export interface ParsedMidi {
  name: string;
  tracks: ParsedMidiTrack[];
  tempo: number;
  timeSignature: TimeSignature;
  durationSeconds: number;
}

export interface MidiImportOptions {
  trackIndices: number[]; // Which tracks to import
  replaceExisting: boolean; // Replace all notes vs append
  importTempo: boolean;
  importTimeSignature: boolean;
}

export interface MidiImportResult {
  notes: Note[];
  tempo?: number;
  timeSignature?: TimeSignature;
}

/**
 * Parse a MIDI file and extract track information
 */
export async function parseMidiFile(file: File): Promise<ParsedMidi> {
  const arrayBuffer = await file.arrayBuffer();
  const midi = new Midi(arrayBuffer);

  // Get tempo from first tempo event, default to 120
  const tempo = midi.header.tempos.length > 0 ? midi.header.tempos[0].bpm : 120;

  // Get time signature from first event, default to 4/4
  const timeSignature: TimeSignature =
    midi.header.timeSignatures.length > 0
      ? {
          numerator: midi.header.timeSignatures[0].timeSignature[0],
          denominator: midi.header.timeSignatures[0].timeSignature[1],
        }
      : { numerator: 4, denominator: 4 };

  // Parse tracks
  const tracks: ParsedMidiTrack[] = midi.tracks
    .map((track, index) => ({
      index,
      name: track.name || `Track ${index + 1}`,
      noteCount: track.notes.length,
      instrument: track.instrument?.name,
    }))
    .filter((t) => t.noteCount > 0); // Only include tracks with notes

  // Calculate duration
  const durationSeconds = midi.duration;

  return {
    name: midi.name || file.name.replace(/\.mid$/i, ""),
    tracks,
    tempo: Math.round(tempo),
    timeSignature,
    durationSeconds,
  };
}

/**
 * Convert MIDI file tracks to Note objects
 */
export async function importMidiNotes(
  file: File,
  options: MidiImportOptions,
): Promise<MidiImportResult> {
  const arrayBuffer = await file.arrayBuffer();
  const midi = new Midi(arrayBuffer);

  // Get tempo for conversion
  const tempo = midi.header.tempos.length > 0 ? midi.header.tempos[0].bpm : 120;

  // Get time signature
  const timeSignature: TimeSignature =
    midi.header.timeSignatures.length > 0
      ? {
          numerator: midi.header.timeSignatures[0].timeSignature[0],
          denominator: midi.header.timeSignatures[0].timeSignature[1],
        }
      : { numerator: 4, denominator: 4 };

  // Convert seconds to beats
  const secondsToBeats = (seconds: number): number => {
    return (seconds / 60) * tempo;
  };

  // Collect notes from selected tracks
  const notes: Note[] = [];

  for (const trackIndex of options.trackIndices) {
    const track = midi.tracks[trackIndex];
    if (!track) continue;

    for (const midiNote of track.notes) {
      notes.push({
        id: generateNoteId(),
        pitch: midiNote.midi,
        start: secondsToBeats(midiNote.time),
        duration: secondsToBeats(midiNote.duration),
        velocity: Math.round(midiNote.velocity * 127),
      });
    }
  }

  // Sort notes by start time
  notes.sort((a, b) => a.start - b.start);

  return {
    notes,
    tempo: options.importTempo ? Math.round(tempo) : undefined,
    timeSignature: options.importTimeSignature ? timeSignature : undefined,
  };
}

/**
 * Check if a file is likely a MIDI file
 */
export function isMidiFile(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith(".mid") ||
    file.name.toLowerCase().endsWith(".midi") ||
    file.type === "audio/midi" ||
    file.type === "audio/x-midi"
  );
}
