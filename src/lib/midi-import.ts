// MIDI file import using @tonejs/midi

import { Midi } from "@tonejs/midi";
import {
  DEFAULT_TIME_SIGNATURE,
  type Note,
  type TimeSignature,
} from "../types";
import { generateNoteId } from "./project-store";

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
      : DEFAULT_TIME_SIGNATURE;

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
      : DEFAULT_TIME_SIGNATURE;

  // Collect notes from selected tracks
  // Reading ticks directly (instead of the seconds @tonejs/midi derives
  // from the tempo map) keeps positions exact and independent of any
  // mid-song tempo changes
  const ppq = midi.header.ppq;
  const notes: Note[] = [];

  for (const trackIndex of options.trackIndices) {
    const track = midi.tracks[trackIndex];
    if (!track) {
      continue;
    }

    for (const midiNote of track.notes) {
      notes.push({
        id: generateNoteId(),
        pitch: midiNote.midi,
        start: midiNote.ticks / ppq,
        duration: midiNote.durationTicks / ppq,
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
