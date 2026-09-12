import { useState, useSyncExternalStore } from "react";
import { RecorderRuntime } from "../../lib/recorder/runtime";
import { RecorderMixer } from "../recorder/recorder-mixer";
import { RecorderPanel } from "../recorder/recorder-panel";
import { Button } from "../ui/button";

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
  const [open, setOpen] = useState(true);
  const [openEffects, setOpenEffects] = useState<ReadonlySet<string>>(
    new Set(),
  );

  if (!open) {
    return (
      <Button
        className="px-3 py-2 text-xs hover:bg-neutral-700"
        onClick={() => setOpen(true)}
      >
        Open Mixer
      </Button>
    );
  }

  return (
    <RecorderPanel
      title="Mixer"
      closeLabel="Close Mixer"
      onClose={() => setOpen(false)}
      className="pointer-events-auto"
    >
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
    </RecorderPanel>
  );
}
