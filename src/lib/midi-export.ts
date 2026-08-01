import { Midi } from "@tonejs/midi";
import { Note, TimeSignature } from "../types";

export interface MidiExportOptions {
  notes: Note[];
  tempo: number;
  timeSignature: TimeSignature;
  /** Sequence name (song title) */
  name: string;
  trackName: string;
}

/**
 * Export notes to a MIDI file with the specified tempo and time signature
 * @param options - Notes, tempo, time signature, sequence name, and track name
 * @returns Uint8Array containing the MIDI file data
 */
export function exportMidi(options: MidiExportOptions): Uint8Array {
  const { notes, tempo, timeSignature, name, trackName } = options;

  // Create a new MIDI file
  const midi = new Midi();
  midi.name = name;

  // Set tempo
  midi.header.setTempo(tempo);

  // Set time signature
  midi.header.timeSignatures = [
    {
      ticks: 0,
      timeSignature: [timeSignature.numerator, timeSignature.denominator],
      measures: 0,
    },
  ];

  // Add a single track for all notes
  const track = midi.addTrack();
  track.name = trackName;

  // Add all notes to the track
  // Notes in the store are in beats (quarter notes), so writing ticks
  // directly keeps grid alignment exact instead of round-tripping
  // through seconds and the tempo
  const ppq = midi.header.ppq;
  notes.forEach((note) => {
    track.addNote({
      midi: note.pitch,
      ticks: Math.round(note.start * ppq),
      durationTicks: Math.max(1, Math.round(note.duration * ppq)),
      velocity: note.velocity / 127, // @tonejs/midi uses normalized 0-1 velocity
    });
  });

  // Convert to Uint8Array
  return midi.toArray();
}
