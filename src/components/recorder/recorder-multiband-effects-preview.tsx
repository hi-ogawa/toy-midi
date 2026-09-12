import { useState } from "react";
import type { MultibandEqParameters } from "../../lib/dsp/biquad-eq";
import { dbToGain } from "../../lib/music";
import { RecorderMultibandEffects } from "./recorder-multiband-effects";

const INITIAL_EQ: MultibandEqParameters = {
  bypass: false,
  bands: [
    {
      id: "low",
      frequency: 120,
      gain: dbToGain(5),
      q: 0.8,
      bypass: false,
    },
    {
      id: "mid",
      frequency: 850,
      gain: dbToGain(-7),
      q: 2.4,
      bypass: false,
    },
    {
      id: "high",
      frequency: 4800,
      gain: dbToGain(3.5),
      q: 1.4,
      bypass: false,
    },
  ],
};

export function RecorderMultibandEffectsPreview() {
  const [eq, setEq] = useState(INITIAL_EQ);

  return (
    <div
      data-testid="recorder-multiband-effects-panel"
      className="w-96 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-3 shadow-2xl"
    >
      <RecorderMultibandEffects eq={eq} onChange={setEq} />
    </div>
  );
}
