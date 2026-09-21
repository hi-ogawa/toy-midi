import { useEffect, useRef, useState } from "react";
import type { CalibrationResult } from "../../lib/latency-checker/calibration";
import {
  auditionCalibration,
  measureLatency,
} from "../../lib/latency-checker/session";
import type { RecorderRuntime } from "../../lib/recorder/runtime";
import { Button } from "../ui/button";

export function InputCalibration({
  runtime,
  disabled,
  onBusyChange,
  onApply,
}: {
  runtime: RecorderRuntime;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onApply: (seconds: number) => void;
}) {
  const [result, setResult] = useState<CalibrationResult>();
  const [activity, setActivity] = useState<"measure" | "raw" | "compensated">();
  const [error, setError] = useState<string>();
  const [applied, setApplied] = useState(false);
  const [outputLevel, setOutputLevel] = useState(-24);
  const active = useRef<
    { controller: AbortController; restore: () => void } | undefined
  >(undefined);
  useEffect(
    () => () => {
      active.current?.controller.abort();
      active.current?.restore();
    },
    [],
  );

  const offsets = result?.analysis.measurements
    .map((m) => m.offsetSamples)
    .sort((a, b) => a - b);
  const medianMs =
    result && offsets
      ? (offsets[Math.floor(offsets.length / 2)] / result.sampleRate) * 1000
      : 0;
  const spreadMs =
    result && offsets
      ? ((offsets.at(-1)! - offsets[0]) / result.sampleRate) * 1000
      : 0;
  const reliable =
    !!result &&
    Number.isFinite(medianMs) &&
    result.analysis.measurements.every(
      (m) =>
        Number.isFinite(m.score) &&
        m.score >= 0.25 &&
        Number.isFinite(m.offsetSamples),
    );

  async function run(mode: "measure" | "raw" | "compensated") {
    const input = runtime.captureInput;
    if (
      !input ||
      active.current ||
      runtime.store.get().captureStatus === "recording"
    ) {
      return;
    }
    runtime.pause();
    const monitoring = runtime.store.get().inputMonitoring;
    runtime.setInputMonitoring(false);
    const controller = new AbortController();
    const restore = () => {
      if (runtime.captureInput === input) {
        runtime.setInputMonitoring(monitoring);
      }
    };
    const session = { controller, restore };
    active.current = session;
    setActivity(mode);
    setError(undefined);
    onBusyChange(true);
    if (mode === "measure") {
      setResult(undefined);
      setApplied(false);
    }
    try {
      if (mode === "measure") {
        const next = await measureLatency({
          context: runtime.context,
          capture: {
            start: () => input.startCapture(),
            stop: () => input.stopCapture(),
            subscribe: (listener) => input.subscribeSamples(listener),
          },
          outputLevel,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setResult(next);
        }
      } else if (result) {
        await auditionCalibration({
          context: runtime.context,
          result,
          variant: mode,
          compensationMs: medianMs,
          signal: controller.signal,
        });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      // Closing the dialog restores immediately; do not restore over a later session.
      if (!controller.signal.aborted) {
        restore();
      }
      if (active.current === session) {
        active.current = undefined;
        setActivity(undefined);
        onBusyChange(false);
      }
    }
  }

  function cancel() {
    active.current?.controller.abort();
    active.current?.restore();
  }

  return (
    <section
      aria-label="Latency calibration"
      className="mt-4 space-y-3 border-t border-neutral-700 pt-3 text-xs"
    >
      <h3 className="font-medium text-neutral-200">Measure latency</h3>
      <p className="leading-5 text-neutral-400">
        Connect an output to the selected input with a cable and turn off the
        interface’s direct monitoring. The test plays seven probes. Playback
        pauses and input monitoring is temporarily muted.
      </p>
      <label className="flex items-center gap-3 text-neutral-400">
        Probe level
        <input
          aria-label="Probe level"
          type="range"
          min={-48}
          max={-6}
          step={1}
          value={outputLevel}
          disabled={disabled || !!activity}
          onChange={(e) => setOutputLevel(Number(e.currentTarget.value))}
          className="min-w-0 flex-1 accent-emerald-500"
        />
        <span>{outputLevel} dB</span>
      </label>
      {activity ? (
        <div className="flex items-center gap-3">
          <span role="status">
            {activity === "measure"
              ? "Measuring latency…"
              : `Playing ${activity} comparison…`}
          </span>
          <Button
            className="h-8 border-neutral-600 px-2 text-xs"
            onClick={cancel}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          className="h-8 border-neutral-600 px-2 text-xs"
          disabled={disabled}
          onClick={() => void run("measure")}
        >
          {result ? "Measure again" : "Start measurement"}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-orange-200">
          {error}
        </p>
      )}
      {result && (
        <>
          <dl className="grid grid-cols-2 gap-2 text-neutral-200">
            <dt>Measured offset</dt>
            <dd>{medianMs.toFixed(3)} ms</dd>
            <dt>Spread</dt>
            <dd>{spreadMs.toFixed(3)} ms</dd>
          </dl>
          {!reliable && (
            <p role="alert" className="text-orange-200">
              Weak detection. Check the return connection and levels, then
              measure again. This result cannot be applied.
            </p>
          )}
          <details className="text-neutral-400">
            <summary className="cursor-pointer">Detected probes</summary>
            <ol className="mt-2 space-y-1">
              {result.analysis.measurements.map((m, i) => (
                <li key={i}>
                  Probe {i + 1}:{" "}
                  {((m.offsetSamples / result.sampleRate) * 1000).toFixed(3)} ms
                  / {(m.score * 100).toFixed(0)}%
                </li>
              ))}
            </ol>
          </details>
          <div className="flex flex-wrap gap-2">
            <Button
              className="h-8 border-neutral-600 px-2 text-xs"
              disabled={disabled || !!activity}
              onClick={() => void run("raw")}
            >
              Play raw comparison
            </Button>
            <Button
              className="h-8 border-neutral-600 px-2 text-xs"
              disabled={disabled || !!activity || !reliable}
              onClick={() => void run("compensated")}
            >
              Play compensated comparison
            </Button>
            <Button
              className="h-8 border-neutral-600 px-2 text-xs"
              disabled={disabled || !!activity || !reliable}
              onClick={() => {
                onApply(medianMs / 1000);
                setApplied(true);
              }}
            >
              Apply compensation
            </Button>
          </div>
          {applied && (
            <p role="status" className="text-emerald-400">
              Compensation applied.
            </p>
          )}
        </>
      )}
    </section>
  );
}
