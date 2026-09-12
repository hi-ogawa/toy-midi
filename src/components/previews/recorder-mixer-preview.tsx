import { useState } from "react";
import {
  RecorderMixer,
  type RecorderMixerState,
} from "../recorder/recorder-mixer";

export function RecorderMixerPreview() {
  const [state, setState] = useState<RecorderMixerState>({
    masterGain: 1,
    metronomeGain: 1,
    metronomeEnabled: false,
    audioTracks: [
      { id: "audio-1", gain: 1, muted: false, soloed: false },
      { id: "audio-2", gain: 1, muted: false, soloed: false },
    ],
    recordingTrack: { gain: 1, muted: false, soloed: false },
  });
  const [openEffects, setOpenEffects] = useState<ReadonlySet<string>>(
    new Set(),
  );

  return (
    <RecorderMixer
      onMasterGainChange={(masterGain) =>
        setState((current) => ({ ...current, masterGain }))
      }
      onMetronomeGainChange={(metronomeGain) =>
        setState((current) => ({ ...current, metronomeGain }))
      }
      onMetronomeEnabledChange={(metronomeEnabled) =>
        setState((current) => ({ ...current, metronomeEnabled }))
      }
      onAudioTrackMixChange={({ id, update }) =>
        setState((current) => ({
          ...current,
          audioTracks: current.audioTracks.map((track) =>
            track.id === id ? { ...track, ...update } : track,
          ),
        }))
      }
      onRecordingTrackMixChange={(update) =>
        setState((current) => ({
          ...current,
          recordingTrack: { ...current.recordingTrack, ...update },
        }))
      }
      state={state}
      openEffects={openEffects}
      onEffectsToggle={(id) =>
        setOpenEffects((current) => {
          const next = new Set(current);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          return next;
        })
      }
    />
  );
}
