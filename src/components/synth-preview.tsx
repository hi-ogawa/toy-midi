import { useState } from "react";
import {
  createSynthLayer,
  type SynthPatch,
} from "../lib/dsp/subtractive-synth";
import { dbToGain } from "../lib/music";
import { SynthPanelContent } from "./synth-panel";

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

  // The panel's default width, where its layer headers are tightest
  return (
    <div className="h-128 w-80 overflow-auto rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-3 shadow-2xl">
      <SynthPanelContent patch={patch} onChange={setPatch} />
    </div>
  );
}
