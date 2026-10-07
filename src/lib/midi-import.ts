// MIDI file import using @tonejs/midi

import { Midi } from "@tonejs/midi";
import type { Note } from "../types";

export interface ImportedMidiTrack {
  name?: string;
  program: number;
  drums: boolean;
  notes: Note[];
}

/**
 * Read each source track that has notes, with its name, initial program, and
 * whether it plays on the General MIDI drum channel.
 */
export async function readMidiTracks(file: File): Promise<ImportedMidiTrack[]> {
  const midi = new Midi(await file.arrayBuffer());
  // Reading ticks directly (instead of the seconds @tonejs/midi derives
  // from the tempo map) keeps positions exact and independent of any
  // mid-song tempo changes
  const ppq = midi.header.ppq;
  return midi.tracks
    .filter((track) => track.notes.length > 0)
    .map((track) => ({
      name: track.name || undefined,
      program: track.instrument.number,
      drums: track.instrument.percussion,
      notes: track.notes
        .map((midiNote) => ({
          id: `note-${crypto.randomUUID()}`,
          pitch: midiNote.midi,
          start: midiNote.ticks / ppq,
          duration: midiNote.durationTicks / ppq,
          velocity: Math.round(midiNote.velocity * 127),
        }))
        .sort((a, b) => a.start - b.start),
    }));
}
