import { useEffect, useState } from "react";
import { A4_FREQUENCY_HZ, hzToMidi, MIN_DB } from "../../lib/music";
import { spellChromaticPitch } from "../../lib/pitch-spelling";
import type { TunerAnalyser, TunerAnalysis } from "../../lib/tuner-analyser";
import { RecorderPanel } from "./recorder-panel";

const CENT_TICKS = [-50, -25, 0, 25, 50];
const IN_TUNE_CENTS = 5;
const SILENT_ANALYSIS: TunerAnalysis = { status: "silent", levelDb: MIN_DB };

export function RecorderTuner({
  analyser,
  onClose,
}: {
  analyser?: TunerAnalyser;
  onClose: () => void;
}) {
  const [analysis, setAnalysis] = useState<TunerAnalysis>(SILENT_ANALYSIS);

  useEffect(() => {
    setAnalysis(SILENT_ANALYSIS);
    return analyser?.subscribe(setAnalysis);
  }, [analyser]);

  return (
    <RecorderPanel
      title="Tuner"
      closeLabel="Close Tuner"
      onClose={onClose}
      data-testid="recorder-tuner-panel"
      className="pointer-events-auto w-80 shrink-0"
    >
      <RecorderTunerContent analysis={analysis} />
    </RecorderPanel>
  );
}

export function RecorderTunerContent({
  analysis,
}: {
  analysis: TunerAnalysis;
}) {
  const frequencyHz = useDebouncedValue({
    value: analysis.status === "pitched" ? analysis.frequencyHz : undefined,
    delayMs: analysis.status === "pitched" ? 0 : 300,
  });
  const pitched =
    frequencyHz !== undefined ? frequencyToPitch(frequencyHz) : undefined;
  const tuningState = pitched
    ? Math.abs(pitched.cents) <= IN_TUNE_CENTS
      ? { label: "In tune", className: "text-emerald-400" }
      : pitched.cents < 0
        ? { label: "Flat", className: "text-neutral-400" }
        : { label: "Sharp", className: "text-neutral-400" }
    : {
        label: analysis.status === "unstable" ? "Unstable" : "No signal",
        className: "text-neutral-500",
      };

  return (
    <div
      className="space-y-5"
      data-testid="tuner-content"
      data-status={pitched ? "tracking" : "empty"}
    >
      <div className="flex items-center justify-between text-[10px] font-medium tracking-wide text-neutral-500 uppercase">
        <span className={`flex items-center gap-1.5 ${tuningState.className}`}>
          <span className="size-1.5 rounded-full bg-current" />
          {tuningState.label}
        </span>
        <span>Chromatic</span>
      </div>

      <div className="text-center">
        <div className="font-mono text-7xl leading-none font-semibold tracking-tight text-neutral-50">
          {pitched ? (
            <>
              {pitched.note}
              <span className="ml-1 text-3xl text-neutral-400">
                {pitched.octave}
              </span>
            </>
          ) : (
            "--"
          )}
        </div>
        <div
          className={`mt-2 h-5 font-mono text-sm tabular-nums ${tuningState.className}`}
        >
          {pitched &&
            `${pitched.roundedCents > 0 ? "+" : ""}${pitched.roundedCents} cents`}
        </div>
      </div>

      <div>
        <div className="relative h-12">
          <div className="absolute top-4 right-0 left-0 h-px bg-neutral-600" />
          {CENT_TICKS.map((tick) => (
            <div
              key={tick}
              className="absolute top-2 -translate-x-1/2"
              style={{ left: `${tick + 50}%` }}
            >
              <div
                className={
                  tick === 0
                    ? "mx-auto h-5 w-px bg-emerald-400"
                    : "mx-auto h-3 w-px bg-neutral-500"
                }
              />
              <span className="mt-1 block font-mono text-[9px] text-neutral-500">
                {tick > 0 ? `+${tick}` : tick}
              </span>
            </div>
          ))}
          {pitched && (
            <div
              data-testid="tuner-cursor"
              className={`absolute top-0 h-1.5 w-2.5 -translate-x-1/2 ${
                Math.abs(pitched.cents) <= IN_TUNE_CENTS
                  ? "bg-emerald-400"
                  : "bg-neutral-50"
              }`}
              style={{
                left: `${Math.max(0, Math.min(100, pitched.cents + 50))}%`,
                clipPath: "polygon(0 0, 100% 0, 50% 100%)",
              }}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-neutral-700 border-t border-neutral-700 pt-3 text-center">
        <TunerReading
          label="Frequency"
          value={pitched ? `${pitched.frequencyHz.toFixed(2)} Hz` : "-- Hz"}
        />
        <TunerReading
          label="Input"
          value={`${analysis.levelDb.toFixed(1)} dBFS`}
        />
        <TunerReading label="Reference" value={`A4 ${A4_FREQUENCY_HZ} Hz`} />
      </div>
    </div>
  );
}

/** Publish a value after it settles for the given delay, or immediately at zero. */
function useDebouncedValue<T>({
  value,
  delayMs,
}: {
  value: T;
  delayMs: number;
}): T {
  const [settled, setSettled] = useState<T>(() => value);

  useEffect(() => {
    if (delayMs === 0) {
      setSettled(() => value);
      return;
    }
    const timeout = setTimeout(() => setSettled(() => value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return delayMs === 0 ? value : settled;
}

function frequencyToPitch(frequencyHz: number) {
  const fractionalMidi = hzToMidi(frequencyHz);
  const midi = Math.round(fractionalMidi);
  const { step, alter, octave } = spellChromaticPitch(midi);
  const cents = (fractionalMidi - midi) * 100;
  return {
    frequencyHz,
    note: `${step}${alter === 1 ? "#" : alter === -1 ? "b" : ""}`,
    octave,
    cents,
    roundedCents: Math.round(cents),
  };
}

function TunerReading({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2">
      <div className="text-[9px] tracking-wide text-neutral-500 uppercase">
        {label}
      </div>
      <div className="mt-1 font-mono text-[11px] tabular-nums text-neutral-300">
        {value}
      </div>
    </div>
  );
}
