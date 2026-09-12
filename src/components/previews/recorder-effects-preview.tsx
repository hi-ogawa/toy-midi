import { useState } from "react";
import type { EqParameters } from "../../lib/dsp/biquad-eq";
import { dbToGain } from "../../lib/music";
import { RecorderEffects } from "../recorder/recorder-effects";
import { Button } from "../ui/button";

const INITIAL_EQ: EqParameters = {
  frequency: 800,
  gain: dbToGain(8),
  q: 1.2,
  bypass: false,
};

export function RecorderEffectsPreview() {
  const [open, setOpen] = useState(true);
  const [eq, setEq] = useState(INITIAL_EQ);

  if (!open) {
    return (
      <Button
        className="px-3 py-2 text-xs hover:bg-neutral-700"
        onClick={() => setOpen(true)}
      >
        Open Audio 1 Effects
      </Button>
    );
  }

  return (
    <RecorderEffects
      label="Audio 1"
      eq={eq}
      onChange={(update) => setEq((current) => ({ ...current, ...update }))}
      onClose={() => setOpen(false)}
    />
  );
}
