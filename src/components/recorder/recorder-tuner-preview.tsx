import { useState } from "react";
import { midiToHz, MIN_DB } from "../../lib/music";
import type { TunerAnalysis } from "../../lib/tuner-analyser";
import { RecorderTunerContent } from "./recorder-tuner";

const PRESETS: { label: string; analysis: TunerAnalysis }[] = [
  {
    label: "In tune",
    analysis: {
      status: "pitched",
      confidence: 1,
      frequencyHz: midiToHz(28),
      levelDb: -18.4,
    },
  },
  {
    label: "Flat",
    analysis: {
      status: "pitched",
      confidence: 1,
      frequencyHz: midiToHz(28 - 0.25),
      levelDb: -18.4,
    },
  },
  {
    label: "Sharp",
    analysis: {
      status: "pitched",
      confidence: 1,
      frequencyHz: midiToHz(28 + 0.25),
      levelDb: -18.4,
    },
  },
  {
    label: "No signal",
    analysis: { status: "silent", levelDb: MIN_DB },
  },
  {
    label: "Unstable",
    analysis: { status: "unstable", confidence: 0.4, levelDb: -18.4 },
  },
];

export function RecorderTunerPreview() {
  const [preset, setPreset] = useState(PRESETS[0]);

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Tuner preview mode" className="flex gap-2">
        {PRESETS.map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={preset === option}
            onClick={() => setPreset(option)}
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-400 hover:bg-neutral-800 aria-pressed:bg-neutral-700 aria-pressed:text-neutral-100"
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="w-80 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-3 shadow-2xl">
        <RecorderTunerContent analysis={preset.analysis} />
      </div>
    </div>
  );
}
