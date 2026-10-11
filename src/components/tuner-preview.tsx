import { useEffect, useState } from "react";
import { midiToHz, MIN_DB } from "../lib/music";
import { startThrottledAnimationFrameLoop } from "../utils/timing";
import { TunerContent } from "./tuner";

const PRESETS = [
  { label: "Animated", content: <AnimatedTunerPreview /> },
  {
    label: "In tune",
    content: (
      <TunerContent
        analysis={{
          status: "pitched",
          confidence: 1,
          frequencyHz: midiToHz(28),
          levelDb: -18.4,
        }}
      />
    ),
  },
  {
    label: "Flat",
    content: (
      <TunerContent
        analysis={{
          status: "pitched",
          confidence: 1,
          frequencyHz: midiToHz(28 - 0.25),
          levelDb: -18.4,
        }}
      />
    ),
  },
  {
    label: "Sharp",
    content: (
      <TunerContent
        analysis={{
          status: "pitched",
          confidence: 1,
          frequencyHz: midiToHz(28 + 0.25),
          levelDb: -18.4,
        }}
      />
    ),
  },
  {
    label: "No signal",
    content: <TunerContent analysis={{ status: "silent", levelDb: MIN_DB }} />,
  },
  {
    label: "Unstable",
    content: (
      <TunerContent
        analysis={{ status: "unstable", confidence: 0.4, levelDb: -18.4 }}
      />
    ),
  },
];

export function TunerPreview() {
  const [preset, setPreset] = useState(PRESETS[1]);
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
        {preset.content}
      </div>
    </div>
  );
}

function AnimatedTunerPreview() {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAt = performance.now();
    return startThrottledAnimationFrameLoop({
      interval: 50,
      callback: (time) => setElapsedSeconds((time - startedAt) / 1000),
    });
  }, []);

  // Sweep E1 by ±40 cents every eight seconds while the level varies separately.
  return (
    <TunerContent
      analysis={{
        status: "pitched",
        confidence: 1,
        frequencyHz: midiToHz(
          28 + 0.4 * Math.sin((elapsedSeconds * Math.PI) / 4),
        ),
        levelDb: -24 + 12 * Math.sin((elapsedSeconds * 2 * Math.PI) / 3),
      }}
    />
  );
}
