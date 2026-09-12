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
    <div className="w-96">
      <RecorderEffectsContent
        eq={eq}
        onChange={(update) => setEq((current) => ({ ...current, ...update }))}
      />
    </div>
  );
}
