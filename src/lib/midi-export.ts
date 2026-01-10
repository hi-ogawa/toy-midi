import { Midi } from "@tonejs/midi";
import { Note } from "../types";
import { beatsToSeconds } from "../stores/project-store";

export interface MidiExportOptions {
  notes: Note[];
  tempo: number;
  trackName?: string;
}

/**
 * Export notes to a MIDI file with the specified tempo
 * @param options - Notes, tempo, and optional track name
 * @returns Uint8Array containing the MIDI file data
 */
export function exportMidi(options: MidiExportOptions): Uint8Array {
  const { notes, tempo, trackName = "Piano Roll" } = options;

  // Create a new MIDI file
  const midi = new Midi();
  
  // Set tempo
  midi.header.setTempo(tempo);
  
  // Add a single track for all notes
  const track = midi.addTrack();
  track.name = trackName;
  
  // Add all notes to the track
  // Notes in the store are in beats, need to convert to seconds
  notes.forEach((note) => {
    const timeInSeconds = beatsToSeconds(note.start, tempo);
    const durationInSeconds = beatsToSeconds(note.duration, tempo);
    
    track.addNote({
      midi: note.pitch,
      time: timeInSeconds,
      duration: durationInSeconds,
      velocity: note.velocity / 127, // @tonejs/midi uses normalized 0-1 velocity
    });
  });

  // Convert to Uint8Array
  return midi.toArray();
}

/**
 * Download MIDI file to the user's computer
 * @param midiData - Uint8Array containing MIDI file data
 * @param fileName - Desired file name (default: "export.mid")
 */
export function downloadMidiFile(
  midiData: Uint8Array,
  fileName: string = "export.mid",
): void {
  // Ensure .mid extension
  if (!fileName.endsWith(".mid")) {
    fileName += ".mid";
  }

  // Create a blob from the byte array
  // Cast to any to avoid TypeScript issues with ArrayBufferLike vs ArrayBuffer
  const blob = new Blob([midiData as any], { type: "audio/midi" });

  // Create a download link and trigger it
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up the URL
  URL.revokeObjectURL(url);
}
