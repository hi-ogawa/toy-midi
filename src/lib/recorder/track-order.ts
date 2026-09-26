import type { AudioTrackState, MidiTrackState } from "./runtime.ts";

export type RecorderTrackEntry =
  | { kind: "audio"; id: string; track: AudioTrackState }
  | { kind: "midi"; id: string; track: MidiTrackState };

/** Resolve trackOrder ids to the rows they place. */
export function resolveTrackOrder({
  trackOrder,
  audioTracks,
  midiTracks,
}: {
  trackOrder: string[];
  audioTracks: AudioTrackState[];
  midiTracks: MidiTrackState[];
}): RecorderTrackEntry[] {
  return trackOrder.map((id): RecorderTrackEntry => {
    const audioTrack = audioTracks.find((track) => track.id === id);
    if (audioTrack) {
      return { kind: "audio", id, track: audioTrack };
    }
    const midiTrack = midiTracks.find((track) => track.id === id);
    if (!midiTrack) {
      throw new Error("Track order lists a missing track.");
    }
    return { kind: "midi", id, track: midiTrack };
  });
}
