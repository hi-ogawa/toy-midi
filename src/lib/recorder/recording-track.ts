// The Capture track is an ordinary audioTracks entry with this fixed id. Only
// the Capture row UI, its minimum height, and its removal guard depend on it.
export const RECORDING_TRACK_ID = "__capture__";

/** The Capture track is always present in audioTracks. */
export function getRecordingTrack<T extends { id: string }>(
  audioTracks: readonly T[],
): T {
  const track = audioTracks.find((track) => track.id === RECORDING_TRACK_ID);
  if (!track) {
    throw new Error("Recording track state is missing.");
  }
  return track;
}
