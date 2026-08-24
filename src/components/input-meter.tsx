import { useEffect, useState } from "react";
import type { AudioAnalyser } from "../lib/audio-analyser";
import { gainToDb, MAX_DB, MIN_DB } from "../lib/music";

export function InputMeter({
  active,
  analyser,
}: {
  active: boolean;
  analyser?: AudioAnalyser;
}) {
  const sampledPeak = useAnalyserPeak({ active, analyser });

  const getPosition = (value: number) =>
    ((value - MIN_DB) / (MAX_DB - MIN_DB)) * 100;
  const zeroPosition = getPosition(0);
  const decibels = gainToDb(sampledPeak);
  const meterValue = Math.max(MIN_DB, Math.min(MAX_DB, decibels));
  const levelPosition = active ? getPosition(meterValue) : 0;
  const label = active ? `${decibels.toFixed(1)} dBFS` : "-∞ dBFS";

  return (
    <div className="grid grid-cols-[1fr_76px] items-center gap-3">
      <div
        role="meter"
        aria-label="Input peak level"
        aria-valuemin={MIN_DB}
        aria-valuemax={MAX_DB}
        aria-valuenow={active ? meterValue : MIN_DB}
        aria-valuetext={label}
        className="relative h-3 overflow-hidden rounded-full bg-neutral-800 ring-1 ring-inset ring-neutral-700"
      >
        <div
          className="absolute inset-y-0 right-0 bg-red-950/50"
          style={{ width: `${100 - zeroPosition}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 bg-emerald-600 transition-[width] duration-75"
          style={{ width: `${Math.min(levelPosition, zeroPosition)}%` }}
        />
        <div
          className="absolute inset-y-0 bg-red-600 transition-[width] duration-75"
          style={{
            left: `${zeroPosition}%`,
            width: `${Math.max(0, levelPosition - zeroPosition)}%`,
          }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-y-0 w-px bg-red-700"
          style={{ left: `${zeroPosition}%` }}
        />
      </div>
      <output className="text-right font-mono text-xs tabular-nums text-neutral-400">
        {label}
      </output>
    </div>
  );
}

function useAnalyserPeak({
  active,
  analyser,
}: {
  active: boolean;
  analyser?: AudioAnalyser;
}): number {
  const [peak, setPeak] = useState(0);

  useEffect(() => {
    if (!active || !analyser) {
      setPeak(0);
      return;
    }
    return analyser.subscribe(({ peak }) => setPeak(peak));
  }, [active, analyser]);

  return peak;
}
