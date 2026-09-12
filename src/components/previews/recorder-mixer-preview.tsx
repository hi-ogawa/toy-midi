import { useState, useSyncExternalStore } from "react";
import { RecorderRuntime } from "../../lib/recorder/runtime";
import { RecorderMixer } from "../recorder/recorder-mixer";

export function RecorderMixerPreview() {
  const [runtime] = useState(() => {
    const runtime = new RecorderRuntime();
    runtime.addAudioTrack();
    runtime.addAudioTrack();
    return runtime;
  });
  const state = useSyncExternalStore(
    runtime.store.subscribe,
    runtime.store.get,
  );
  const [openEffects, setOpenEffects] = useState<ReadonlySet<string>>(
    new Set(),
  );

  return (
    <RecorderMixer
      runtime={runtime}
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
