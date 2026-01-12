import { beatsToSeconds } from "../stores/project-store";
import { Note, TimeSignature } from "../types";

export interface ABCExportOptions {
  notes: Note[];
  tempo: number;
  timeSignature?: TimeSignature;
  title?: string;
}

// Number of bars to display per line in ABC notation
const BARS_PER_LINE = 4;

// Helper function to calculate greatest common divisor
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Convert MIDI pitch to ABC notation
 * ABC uses: C,, D,, ... (two octaves below middle C)
 *          C, D, ... (one octave below middle C)
 *          C D E F G A B c d e f g a b c' d' e' ...
 * Middle C (MIDI 60) = c in ABC
 */
function midiToABC(pitch: number): string {
  const noteNames = [
    "C",
    "^C",
    "D",
    "^D",
    "E",
    "F",
    "^F",
    "G",
    "^G",
    "A",
    "^A",
    "B",
  ];
  const octave = Math.floor(pitch / 12) - 1; // MIDI octave (C4 = 60 = octave 4)
  const noteIndex = pitch % 12;
  let noteName = noteNames[noteIndex];

  // Middle C is MIDI 60 (C4), which is 'c' in ABC
  // Octaves in ABC:
  // C,, = MIDI 24 (C1), C, = MIDI 36 (C2), C = MIDI 48 (C3)
  // c = MIDI 60 (C4), c' = MIDI 72 (C5), c'' = MIDI 84 (C6)

  if (octave < 3) {
    // Below C3 (MIDI 48): use uppercase with commas
    const commas = 3 - octave;
    return noteName + ",".repeat(commas);
  } else if (octave === 3) {
    // C3-B3 (MIDI 48-59): use uppercase
    return noteName;
  } else if (octave === 4) {
    // C4-B4 (MIDI 60-71): use lowercase (middle octave)
    return noteName.toLowerCase();
  } else {
    // C5+ (MIDI 72+): use lowercase with apostrophes
    const apostrophes = octave - 4;
    return noteName.toLowerCase() + "'".repeat(apostrophes);
  }
}

/**
 * Convert duration in beats to ABC note length notation
 * ABC uses numbers for multipliers and / for division
 * Examples: C (quarter), C2 (half), C4 (whole), C/2 (eighth), C/4 (sixteenth)
 * Assumes denominator = 4 (quarter note beat)
 */
function durationToABC(beats: number): string {
  // Common durations for 4/4 time
  if (beats === 4) return "4"; // whole note
  if (beats === 3) return "3"; // dotted half
  if (beats === 2) return "2"; // half note
  if (beats === 1.5) return "3/2"; // dotted quarter
  if (beats === 1) return ""; // quarter note (default, no number needed)
  if (beats === 0.75) return "3/4"; // dotted eighth
  if (beats === 0.5) return "/2"; // eighth note
  if (beats === 0.25) return "/4"; // sixteenth note
  if (beats === 0.125) return "/8"; // thirty-second note

  // Generic conversion for other durations
  // ABC default is quarter note = 1 beat
  if (beats > 1) {
    // Check if it's a clean integer
    if (Number.isInteger(beats)) {
      return beats.toString();
    }
    // Check if it's a clean fraction
    const fraction = beats;
    const numerator = Math.round(fraction * 4);
    const denominator = 4;
    const divisor = gcd(numerator, denominator);
    const simplifiedNum = numerator / divisor;
    const simplifiedDen = denominator / divisor;
    if (simplifiedDen === 1) {
      return simplifiedNum.toString();
    }
    return `${simplifiedNum}/${simplifiedDen}`;
  } else {
    // Less than 1 beat - use division
    const divisor = Math.round(1 / beats);
    if (Math.abs(1 / divisor - beats) < 0.001) {
      return `/${divisor}`;
    }
    // Fallback for odd values
    const fraction = beats;
    const numerator = Math.round(fraction * 16);
    const denominator = 16;
    const divisor2 = gcd(numerator, denominator);
    const simplifiedNum = numerator / divisor2;
    const simplifiedDen = denominator / divisor2;
    return `${simplifiedNum}/${simplifiedDen}`;
  }
}

/**
 * Export notes to ABC notation format
 * @param options - Notes, tempo, time signature, and optional title
 * @returns String containing ABC notation
 */
export function exportABC(options: ABCExportOptions): string {
  const {
    notes,
    tempo,
    timeSignature = { numerator: 4, denominator: 4 },
    title = "Untitled",
  } = options;

  const lines: string[] = [];

  // ABC header
  lines.push("X:1"); // Reference number
  lines.push(`T:${title}`); // Title
  lines.push(`M:${timeSignature.numerator}/${timeSignature.denominator}`); // Meter (time signature)
  lines.push(`L:1/${timeSignature.denominator}`); // Default note length (quarter note for 4/4)
  lines.push(`Q:1/${timeSignature.denominator}=${tempo}`); // Tempo
  // Key signature: C major by default (all sharps/flats rendered as accidentals)
  // This is a design choice since MIDI notes don't inherently indicate key
  lines.push("K:C");

  // Sort notes by start time
  const sortedNotes = [...notes].sort((a, b) => a.start - b.start);

  if (sortedNotes.length === 0) {
    // Empty tune
    lines.push("z4 |"); // 4 beats of rest with bar line
    return lines.join("\n");
  }

  // Convert notes to ABC notation
  // For simplicity, we'll create a monophonic line (one note at a time)
  // If there are overlapping notes, they'll be rendered sequentially

  let currentBeat = 0;
  let currentLine = "";
  const beatsPerBar = timeSignature.numerator * (4 / timeSignature.denominator);
  let currentBar = 0;

  for (let i = 0; i < sortedNotes.length; i++) {
    const note = sortedNotes[i];

    // Add rests if there's a gap before this note
    if (note.start > currentBeat) {
      const restDuration = note.start - currentBeat;
      currentLine += "z" + durationToABC(restDuration) + " ";
      currentBeat = note.start;
    }

    // Add the note
    const abcNote = midiToABC(note.pitch);
    const abcDuration = durationToABC(note.duration);
    currentLine += abcNote + abcDuration + " ";
    currentBeat = note.start + note.duration;

    // Check if we've crossed a bar boundary
    const newBar = Math.floor(currentBeat / beatsPerBar);
    if (newBar > currentBar || i === sortedNotes.length - 1) {
      // Add bar line
      currentLine = currentLine.trim() + " |";
      currentBar = newBar;

      // Start new line every BARS_PER_LINE bars or at the end
      if (currentBar % BARS_PER_LINE === 0 || i === sortedNotes.length - 1) {
        lines.push(currentLine);
        currentLine = "";
      } else {
        currentLine += " ";
      }
    }
  }

  // Add any remaining content
  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  return lines.join("\n");
}

/**
 * Copy ABC notation to clipboard
 * @param abcText - ABC notation string
 * @returns Promise that resolves when copy is complete
 */
export async function copyABCToClipboard(abcText: string): Promise<void> {
  if (!navigator.clipboard) {
    throw new Error("Clipboard API not available");
  }
  await navigator.clipboard.writeText(abcText);
}

/**
 * Download ABC notation file to the user's computer
 * @param abcText - ABC notation string
 * @param fileName - Desired file name (default: "export.abc")
 */
export function downloadABCFile(
  abcText: string,
  fileName: string = "export.abc",
): void {
  // Ensure .abc extension
  if (!fileName.endsWith(".abc")) {
    fileName += ".abc";
  }

  // Create a blob from the text
  const blob = new Blob([abcText], { type: "text/plain" });

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
