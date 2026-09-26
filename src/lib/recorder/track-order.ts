import { RECORDING_TRACK_ID } from "./recording-track.ts";
import {
  type AudioTrackState,
  type MidiTrackState,
  REFERENCE_VIDEO_TRACK_ID,
} from "./runtime.ts";

export type RecorderTrackEntry =
  | { kind: "reference"; id: string }
  | { kind: "capture"; id: string; track: AudioTrackState }
  | { kind: "audio"; id: string; track: AudioTrackState; label: string }
  | { kind: "midi"; id: string; track: MidiTrackState };

/**
 * Resolve trackOrder ids to the rows they place. Ordinary audio tracks keep
 * labels numbered by their audioTracks position, so moving a row does not
 * rename it.
 */
export function resolveTrackOrder({
  trackOrder,
  audioTracks,
  midiTracks,
}: {
  trackOrder: string[];
  audioTracks: AudioTrackState[];
  midiTracks: MidiTrackState[];
}): RecorderTrackEntry[] {
  const audioLabels = new Map(
    audioTracks
      .filter((track) => track.id !== RECORDING_TRACK_ID)
      .map((track, index) => [track.id, `Audio ${index + 1}`]),
  );
  return trackOrder.map((id): RecorderTrackEntry => {
    if (id === REFERENCE_VIDEO_TRACK_ID) {
      return { kind: "reference", id };
    }
    const audioTrack = audioTracks.find((track) => track.id === id);
    if (audioTrack) {
      return id === RECORDING_TRACK_ID
        ? { kind: "capture", id, track: audioTrack }
        : { kind: "audio", id, track: audioTrack, label: audioLabels.get(id)! };
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
    case "capture": {
      return "Capture";
    }
    case "audio": {
      return entry.label;
    }
    case "midi": {
      return entry.track.name;
    }
  }
}
