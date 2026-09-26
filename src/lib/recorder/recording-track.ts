// The Capture track is an ordinary audioTracks entry with this fixed id. Any
// audio track can be armed, but only this track shows arm and monitoring
// controls for now, and the Capture row UI and removal guard also depend on it.
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
