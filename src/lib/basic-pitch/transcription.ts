export interface TranscribeParams {
  onsetThreshold: number; // 0-1, higher = fewer note splits
  frameThreshold: number; // 0-1, higher = fewer detected notes
  minNoteLengthMs: number; // drop detections shorter than this
  minPitchMidi: number;
  maxPitchMidi: number;
}

export interface TranscribedNote {
  startSeconds: number; // relative to the source audio, not the timeline
  durationSeconds: number;
  pitchMidi: number;
  amplitude: number; // model confidence 0-1, not musical velocity
}

// Matches the Basic Pitch reference decoder defaults: onset 0.5, frame 0.3,
// min length 5 frames (~58 ms), and the model's full pitch range (MIDI 21-108)
export const DEFAULT_TRANSCRIBE_PARAMS: TranscribeParams = {
  onsetThreshold: 0.5,
  frameThreshold: 0.3,
  minNoteLengthMs: 58,
  minPitchMidi: 21, // A0
  maxPitchMidi: 108, // C8
};
