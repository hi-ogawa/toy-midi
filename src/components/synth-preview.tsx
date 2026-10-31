import { useState } from "react";
import {
  createSynthLayer,
  type SynthPatch,
} from "../lib/dsp/subtractive-synth";
import { dbToGain } from "../lib/music";
import { SynthPanel } from "./synth-panel";

function createInitialPatch(): SynthPatch {
  const saw = createSynthLayer();
  const square = createSynthLayer();
  return {
    layers: [
      {
        ...saw,
        oscillator: { ...saw.oscillator, waveform: "sawtooth" },
        amp: {
          envelope: { attack: 0.01, decay: 0.4, sustain: 0.6, release: 0.2 },
        },
      },
      {
        ...square,
        oscillator: { ...square.oscillator, waveform: "square" },
        gain: dbToGain(-6),
      },
    ],
  };
}

export function SynthPreview() {
  const [patch, setPatch] = useState(createInitialPatch);

  // The panel resizes from its top-left corner, so it sits at the bottom
  // right, where the app docks it.
  return (
    <div className="flex h-[640px] items-end justify-end">
      <SynthPanel
        label="Bass"
        patch={patch}
        onChange={setPatch}
        onClose={() => {}}
      />
    </div>
  );
}
