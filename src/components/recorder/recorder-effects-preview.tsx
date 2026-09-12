import { useState } from "react";
import type { EqParameters } from "../../lib/dsp/biquad-eq";
import { dbToGain } from "../../lib/music";
import { RecorderEffectsContent } from "./recorder-effects";

const INITIAL_EQ: EqParameters = {
  frequency: 800,
  gain: dbToGain(8),
  q: 1.2,
  bypass: false,
};

export function RecorderEffectsPreview() {
  const [eq, setEq] = useState(INITIAL_EQ);

  return (
    <div className="w-96 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-3 shadow-2xl">
      <RecorderEffectsContent
        eq={eq}
        onChange={(update) => setEq((current) => ({ ...current, ...update }))}
      />
    </div>
  );
}
