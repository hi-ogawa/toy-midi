import { useEffect, useState } from "react";
import { spellChromaticPitch } from "../../lib/pitch-spelling";
import type { TunerAnalyser, TunerAnalysis } from "../../lib/tuner-analyser";
import { RecorderPanel } from "./recorder-panel";

const CENT_TICKS = [-50, -25, 0, 25, 50];
const IN_TUNE_CENTS = 5;

export type RecorderTunerResult =
  | { status: "silent"; levelDb?: number }
  | { status: "unstable"; levelDb: number }
  | {
      status: "pitched";
      note: string;
      octave: number;
      cents: number;
      frequencyHz: number;
      levelDb: number;
    };

export function RecorderTuner({
  analyser,
  referenceFrequencyHz,
  onClose,
}: {
  analyser?: TunerAnalyser;
  referenceFrequencyHz: number;
  onClose: () => void;
}) {
  const result = useTunerResult({ analyser, referenceFrequencyHz });
  return (
    <RecorderPanel
      title="Tuner"
      closeLabel="Close Tuner"
      onClose={onClose}
      data-testid="recorder-tuner-panel"
      className="pointer-events-auto w-80 shrink-0"
    >
      <RecorderTunerContent
        result={result}
        referenceFrequencyHz={referenceFrequencyHz}
      />
    </RecorderPanel>
  );
}

function useTunerResult({
  analyser,
  referenceFrequencyHz,
}: {
  analyser?: TunerAnalyser;
  referenceFrequencyHz: number;
}): RecorderTunerResult {
  const [result, setResult] = useState<RecorderTunerResult>({
    status: "silent",
  });

  useEffect(() => {
    setResult({ status: "silent" });
    return analyser?.subscribe((analysis) =>
      setResult(toTunerResult({ analysis, referenceFrequencyHz })),
    );
  }, [analyser, referenceFrequencyHz]);

  return result;
}

function toTunerResult({
  analysis,
  referenceFrequencyHz,
}: {
  analysis: TunerAnalysis;
  referenceFrequencyHz: number;
}): RecorderTunerResult {
  if (analysis.status !== "pitched") {
    return { status: analysis.status, levelDb: analysis.levelDb };
  }

  const fractionalMidi =
    69 + 12 * Math.log2(analysis.frequencyHz / referenceFrequencyHz);
  const midi = Math.round(fractionalMidi);
  const { step, alter, octave } = spellChromaticPitch(midi);
  return {
    status: "pitched",
    note: `${step}${alter === 1 ? "#" : alter === -1 ? "b" : ""}`,
    octave,
    cents: (fractionalMidi - midi) * 100,
    frequencyHz: analysis.frequencyHz,
    levelDb: analysis.levelDb,
  };
}

export function RecorderTunerContent({
  result,
  referenceFrequencyHz,
}: {
  result: RecorderTunerResult;
  referenceFrequencyHz: number;
}) {
  const pitched = result.status === "pitched" ? result : undefined;
  const cents = pitched?.cents;
  const roundedCents = cents === undefined ? undefined : Math.round(cents);
  const tuningState =
    cents === undefined
      ? result.status === "silent"
        ? { label: "No signal", className: "text-neutral-500" }
        : { label: "Unstable", className: "text-orange-300" }
      : Math.abs(cents) <= IN_TUNE_CENTS
        ? { label: "In tune", className: "text-emerald-400" }
        : cents < 0
          ? { label: "Flat", className: "text-sky-300" }
          : { label: "Sharp", className: "text-orange-300" };

  return (
    <div className="space-y-5">
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
          className={`mt-2 font-mono text-sm tabular-nums ${tuningState.className}`}
        >
          {roundedCents === undefined
            ? result.status === "silent"
              ? "Play a note"
              : "Finding pitch..."
            : `${roundedCents > 0 ? "+" : ""}${roundedCents} cents`}
        </div>
      </div>

      <div>
        <div className="relative h-12">
          <div className="absolute top-4 right-0 left-0 h-px bg-neutral-600" />
          <div className="absolute top-2 left-1/2 h-5 w-10 -translate-x-1/2 rounded bg-emerald-500/10 ring-1 ring-emerald-500/25" />
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
          {cents !== undefined && (
            <div
              className="absolute top-0 -translate-x-1/2"
              style={{ left: `${Math.max(0, Math.min(100, cents + 50))}%` }}
            >
              <div className="size-2 rotate-45 bg-neutral-50" />
            </div>
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
          value={
            result.levelDb === undefined
              ? "-- dBFS"
              : `${result.levelDb.toFixed(1)} dBFS`
          }
        />
        <TunerReading
          label="Reference"
          value={`A4 ${referenceFrequencyHz} Hz`}
        />
      </div>
    </div>
  );
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
