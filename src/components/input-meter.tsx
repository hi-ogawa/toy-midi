import { gainToDb } from "../lib/music";

export function InputMeter({
  active,
  peak,
}: {
  active: boolean;
  peak: number;
}) {
  const meterMin = -60;
  const meterMax = 6;
  const getMeterPosition = (value: number) =>
    ((value - meterMin) / (meterMax - meterMin)) * 100;
  const zeroPosition = getMeterPosition(0);

  const decibels = gainToDb(peak);
  const meterValue = clamp(decibels, meterMin, meterMax);
  const levelPosition = active ? getMeterPosition(meterValue) : 0;
  const label = active ? `${decibels.toFixed(1)} dBFS` : "-∞ dBFS";

  return (
    <div className="grid grid-cols-[1fr_76px] items-center gap-3">
      <div
        role="meter"
        aria-label="Input peak level"
        aria-valuemin={meterMin}
        aria-valuemax={meterMax}
        aria-valuenow={active ? meterValue : meterMin}
        aria-valuetext={label}
        className="relative h-3 overflow-hidden rounded-full bg-neutral-200"
      >
        <div
          className="absolute inset-y-0 right-0 bg-red-100"
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
      <output className="text-right font-mono text-xs tabular-nums text-neutral-600">
        {label}
      </output>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
