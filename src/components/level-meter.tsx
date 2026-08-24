import { useEffect, useState } from "react";
import type { AudioMeterReading, AudioMeterSource } from "../lib/audio-meter";
import { gainToDb, MAX_DB, MIN_DB } from "../lib/music";
import { cn } from "./ui/utils";

const EMPTY_READING: AudioMeterReading = {
  rms: 0,
  peak: 0,
  peakHold: 0,
  clipped: false,
};

export function LevelMeter({
  active,
  label,
  meter,
  peak,
  compact = false,
}: {
  active: boolean;
  label: string;
  meter?: AudioMeterSource;
  peak?: number;
  compact?: boolean;
}) {
  const [reading, setReading] = useState(EMPTY_READING);

  useEffect(() => {
    if (!active || !meter) {
      setReading(EMPTY_READING);
      return;
    }
    let frame = requestAnimationFrame(function update(time) {
      setReading(meter.read(time));
      frame = requestAnimationFrame(update);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, meter]);

  const resolved = meter
    ? reading
    : { ...EMPTY_READING, rms: peak ?? 0, peak: peak ?? 0 };
  const meterValue = active ? clampDb(gainToDb(resolved.rms)) : MIN_DB;
  const levelPosition = getPosition(meterValue);
  const peakPosition = active
    ? getPosition(clampDb(gainToDb(resolved.peak)))
    : 0;
  const holdPosition = active
    ? getPosition(clampDb(gainToDb(resolved.peakHold)))
    : 0;
  const valueLabel = active ? `${meterValue.toFixed(1)} dBFS RMS` : "-∞ dBFS";

  return (
    <div
      className={cn(
        "grid items-center",
        compact ? "grid-cols-[1fr_auto] gap-1.5" : "grid-cols-[1fr_76px] gap-3",
      )}
    >
      <div
        role="meter"
        aria-label={`${label} level`}
        aria-valuemin={MIN_DB}
        aria-valuemax={MAX_DB}
        aria-valuenow={meterValue}
        aria-valuetext={
          resolved.clipped ? `${valueLabel}, clipped` : valueLabel
        }
        className={cn(
          "relative overflow-hidden rounded-sm bg-neutral-950 ring-1 ring-inset ring-neutral-700",
          compact ? "h-2" : "h-3",
        )}
      >
        <div
          className="absolute inset-y-0 left-0 bg-emerald-600"
          style={{ width: `${levelPosition}%` }}
        />
        <div
          className="absolute inset-y-0 w-px bg-amber-300"
          style={{ left: `${peakPosition}%` }}
        />
        <div
          className="absolute inset-y-0 w-px bg-neutral-100"
          style={{ left: `${holdPosition}%` }}
        />
      </div>
      {compact ? (
        <button
          type="button"
          aria-label={`Reset ${label} clipping indicator`}
          title={
            resolved.clipped
              ? "Clipping detected. Click to reset."
              : "No clipping"
          }
          onClick={() => {
            meter?.resetClip();
            setReading((current) => ({ ...current, clipped: false }));
          }}
          className={cn(
            "size-2 rounded-full ring-1 ring-inset",
            resolved.clipped
              ? "bg-red-500 ring-red-300"
              : "bg-neutral-700 ring-neutral-600",
          )}
        />
      ) : (
        <output className="text-right font-mono text-xs tabular-nums text-neutral-400">
          {valueLabel}
        </output>
      )}
    </div>
  );
}

function getPosition(value: number): number {
  return ((value - MIN_DB) / (MAX_DB - MIN_DB)) * 100;
}

function clampDb(value: number): number {
  return Math.max(MIN_DB, Math.min(MAX_DB, value));
}
