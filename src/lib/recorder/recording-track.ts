import type { AudioTrackState } from "./runtime.ts";

// The Capture track is an ordinary audioTracks entry with this fixed id. Until
// every audio track can record, arming, recording, and monitoring target only
// this track, and the Capture row UI and removal guard also depend on it.
export const RECORDING_TRACK_ID = "__capture__";

/** The Capture track is always present in audioTracks. */
export function getRecordingTrack(
  audioTracks: AudioTrackState[],
): AudioTrackState {
  const track = audioTracks.find((track) => track.id === RECORDING_TRACK_ID);
  if (!track) {
    throw new Error("Recording track state is missing.");
  }
  return track;
}

/** Separate the Capture track, which Audio to MIDI still lists on its own. */
export function splitRecordingTrack(audioTracks: AudioTrackState[]): {
  recordingTrack: AudioTrackState;
  audioTracks: AudioTrackState[];
} {
  return {
    recordingTrack: getRecordingTrack(audioTracks),
    audioTracks: audioTracks.filter((track) => track.id !== RECORDING_TRACK_ID),
  };
}
