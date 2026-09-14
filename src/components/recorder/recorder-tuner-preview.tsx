import { useEffect, useState } from "react";
import { midiToHz, MIN_DB } from "../../lib/music";
import type { TunerAnalysis } from "../../lib/tuner-analyser";
import { startThrottledAnimationFrameLoop } from "../../utils/timing";
import { RecorderTunerContent } from "./recorder-tuner";

const PRESETS: { label: string; analysis: TunerAnalysis | "animated" }[] = [
  { label: "Animated", analysis: "animated" },
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
  const [preset, setPreset] = useState(PRESETS[1]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const animated = preset.analysis === "animated";

  useEffect(() => {
    if (!animated) {
      return;
    }
    setElapsedSeconds(0);
    const startedAt = performance.now();
    return startThrottledAnimationFrameLoop({
      interval: 50,
      callback: (time) => setElapsedSeconds((time - startedAt) / 1000),
    });
  }, [animated]);

  // Sweep E1 by ±40 cents every eight seconds while the level varies separately.
  const analysis: TunerAnalysis =
    preset.analysis === "animated"
      ? {
          status: "pitched",
          confidence: 1,
          frequencyHz: midiToHz(
            28 + 0.4 * Math.sin((elapsedSeconds * Math.PI) / 4),
          ),
          levelDb: -24 + 12 * Math.sin((elapsedSeconds * 2 * Math.PI) / 3),
        }
      : preset.analysis;

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
        <RecorderTunerContent analysis={analysis} />
      </div>
    </div>
  );
}
