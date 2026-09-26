import type {
  AudioTrackState,
  MidiTrackState,
  RecorderRuntimeState,
} from "./runtime.ts";

export type RecorderTrackListsState = Pick<
  RecorderRuntimeState,
  "audioTracks" | "midiTracks" | "trackOrder"
>;

export type RecorderTrackEntry =
  | { kind: "audio"; id: string; track: AudioTrackState }
  | { kind: "midi"; id: string; track: MidiTrackState };

/**
 * Keep the positions of present tracks, drop removed ids, and append new
 * tracks. An empty order places audio tracks before MIDI tracks.
 */
export function syncTrackOrder({
  trackOrder,
  audioTracks,
  midiTracks,
}: RecorderTrackListsState): string[] {
  const ids = new Set([
    ...audioTracks.map((track) => track.id),
    ...midiTracks.map((track) => track.id),
  ]);
  const kept = trackOrder.filter((id) => ids.has(id));
  const added = [...ids].filter((id) => !kept.includes(id));
  const next = [...kept, ...added];
  return next;
}

/** Resolve trackOrder ids to the rows they place. */
export function resolveTrackOrder({
  trackOrder,
  audioTracks,
  midiTracks,
}: RecorderTrackListsState): RecorderTrackEntry[] {
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
