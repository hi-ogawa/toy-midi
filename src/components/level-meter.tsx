import { useEffect, useState } from "react";
import type { AudioAnalyser, AudioAnalysis } from "../lib/audio-analyser";
import { gainToDb, MAX_DB, MIN_DB } from "../lib/music";
import { cn } from "./ui/utils";

type MeterReading = AudioAnalysis & {
  peakHold: number;
  clipped: boolean;
};

const EMPTY_READING: MeterReading = {
  rms: 0,
  peak: 0,
  peakHold: 0,
  clipped: false,
};

export function LevelMeter({
  active,
  analyser,
  label,
  compact = false,
}: {
  active: boolean;
  analyser?: AudioAnalyser;
  label: string;
  compact?: boolean;
}) {
  const [clipReset, setClipReset] = useState(0);
  const reading = useMeterReading({ active, analyser, clipReset });

  const meterValue = active ? clampDb(gainToDb(reading.rms)) : MIN_DB;
  const levelPosition = getPosition(meterValue);
  const peakPosition = active
    ? getPosition(clampDb(gainToDb(reading.peak)))
    : 0;
  const holdPosition = active
    ? getPosition(clampDb(gainToDb(reading.peakHold)))
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
        aria-valuetext={reading.clipped ? `${valueLabel}, clipped` : valueLabel}
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
            reading.clipped
              ? "Clipping detected. Click to reset."
              : "No clipping"
          }
          onClick={() => {
            setClipReset((value) => value + 1);
          }}
          className={cn(
            "size-2 rounded-full ring-1 ring-inset",
            reading.clipped
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

function useMeterReading({
  active,
  analyser,
  clipReset,
}: {
  active: boolean;
  analyser?: AudioAnalyser;
  clipReset: number;
}): MeterReading {
  const [reading, setReading] = useState(EMPTY_READING);

  useEffect(() => {
    setReading((current) => ({ ...current, clipped: false }));
  }, [clipReset]);

  useEffect(() => {
    if (!active || !analyser) {
      setReading(EMPTY_READING);
      return;
    }
    let previousTime = performance.now();
    let peakHoldUntil = 0;
    return analyser.subscribe((analysis) => {
      const time = performance.now();
      const elapsed = Math.max(0, (time - previousTime) / 1000);
      previousTime = time;
      setReading((current) =>
        updateMeterReading({
          analysis,
          current,
          elapsed,
          peakHoldUntil,
          time,
          setPeakHoldUntil: (value) => {
            peakHoldUntil = value;
          },
        }),
      );
    });
  }, [active, analyser]);

  return reading;
}

function updateMeterReading({
  analysis,
  current,
  elapsed,
  peakHoldUntil,
  time,
  setPeakHoldUntil,
}: {
  analysis: AudioAnalysis;
  current: MeterReading;
  elapsed: number;
  peakHoldUntil: number;
  time: number;
  setPeakHoldUntil: (value: number) => void;
}): MeterReading {
  const rms = followLevel({
    current: current.rms,
    target: analysis.rms,
    elapsed,
    timeConstant: analysis.rms > current.rms ? 0.03 : 0.3,
  });
  const peak =
    analysis.peak >= current.peak
      ? analysis.peak
      : followLevel({
          current: current.peak,
          target: analysis.peak,
          elapsed,
          timeConstant: 0.6,
        });
  let peakHold = current.peakHold;
  if (analysis.peak >= peakHold) {
    peakHold = analysis.peak;
    setPeakHoldUntil(time + 1_500);
  } else if (time >= peakHoldUntil) {
    peakHold = peak;
  }
  return {
    rms,
    peak,
    peakHold,
    clipped: current.clipped || analysis.peak >= 1,
  };
}

function getPosition(value: number): number {
  return ((value - MIN_DB) / (MAX_DB - MIN_DB)) * 100;
}

function clampDb(value: number): number {
  return Math.max(MIN_DB, Math.min(MAX_DB, value));
}

function followLevel({
  current,
  target,
  elapsed,
  timeConstant,
}: {
  current: number;
  target: number;
  elapsed: number;
  timeConstant: number;
}): number {
  return target + (current - target) * Math.exp(-elapsed / timeConstant);
}
