import {
  type AudioTrackState,
  type MidiTrackState,
  REFERENCE_VIDEO_TRACK_ID,
} from "./runtime.ts";

export type RecorderTrackEntry =
  | { kind: "reference"; id: string }
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
    if (id === REFERENCE_VIDEO_TRACK_ID) {
      return { kind: "reference", id };
    }
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

export function getTrackEntryLabel(entry: RecorderTrackEntry): string {
  switch (entry.kind) {
    case "reference": {
      return "Reference";
    }
    case "audio": {
      return entry.track.name;
    }
    case "midi": {
      return entry.track.name;
    }
  }
}
