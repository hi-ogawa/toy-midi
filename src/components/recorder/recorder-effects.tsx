import { ChevronDown, ChevronRight, SlidersHorizontal } from "lucide-react";
import { useId, useState } from "react";
import { useDraftInput } from "../../hooks/use-draft-input";
import type { EqParameters } from "../../lib/dsp/eq";
import {
  createDefaultPeakingEq,
  EQ_LIMITS,
} from "../../lib/dsp/peaking-eq-node";
import { dbToGain, gainToDb } from "../../lib/music";
import { Slider } from "../ui/slider";
import { EqResponseGraph } from "./eq-response-graph";
import { RecorderPanel } from "./recorder-panel";

export function RecorderEffects({
  label,
  eq,
  onChange,
  onClose,
}: {
  label: string;
  eq: EqParameters;
  onChange: (update: Partial<EqParameters>) => void;
  onClose: () => void;
}) {
  const [slidersOpen, setSlidersOpen] = useState(false);
  const slidersId = useId();
  return (
    <RecorderPanel
      title={`${label} Effects`}
      closeLabel={`Close ${label} Effects`}
      onClose={onClose}
      testId="recorder-effects-panel"
      className="pointer-events-auto w-96 shrink-0"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Peaking EQ</h3>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={eq.bypass}
                onChange={(event) => onChange({ bypass: event.target.checked })}
              />
              Bypass
            </label>
            <button
              onClick={() => onChange(createDefaultPeakingEq())}
              className="rounded border border-neutral-600 px-2 py-1 text-xs hover:bg-neutral-700"
            >
              Reset
            </button>
          </div>
        </div>
        <EqResponseGraph eq={eq} onChange={onChange} />
        <div className="grid grid-cols-3 gap-3">
          <EqNumericInput
            label="Frequency"
            unit="Hz"
            limits={EQ_LIMITS.frequency}
            value={eq.frequency}
            onChange={(frequency) => onChange({ frequency })}
          />
          <EqNumericInput
            label="Gain"
            unit="dB"
            limits={EQ_LIMITS.gainDb}
            value={gainToDb(eq.gain)}
            onChange={(gainDb) => onChange({ gain: dbToGain(gainDb) })}
          />
          <EqNumericInput
            label="Q"
            unit=""
            limits={EQ_LIMITS.q}
            value={eq.q}
            onChange={(q) => onChange({ q })}
          />
        </div>
        <div className="space-y-4 border-t border-neutral-700 pt-4">
          <div id={slidersId} hidden={!slidersOpen} className="space-y-4">
            {slidersOpen && (
              <>
                <EqSlider
                  label="Frequency"
                  unit="Hz"
                  limits={EQ_LIMITS.frequency}
                  scale="logarithmic"
                  value={eq.frequency}
                  onChange={(frequency) => onChange({ frequency })}
                />
                <EqSlider
                  label="Gain"
                  unit="dB"
                  limits={EQ_LIMITS.gainDb}
                  value={gainToDb(eq.gain)}
                  onChange={(gainDb) => onChange({ gain: dbToGain(gainDb) })}
                />
                <EqSlider
                  label="Q"
                  unit=""
                  limits={EQ_LIMITS.q}
                  value={eq.q}
                  onChange={(q) => onChange({ q })}
                />
              </>
            )}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              title={slidersOpen ? "Hide sliders" : "Show sliders"}
              aria-label={slidersOpen ? "Hide sliders" : "Show sliders"}
              aria-expanded={slidersOpen}
              aria-controls={slidersId}
              onClick={() => setSlidersOpen((open) => !open)}
              className="flex h-7 items-center gap-1 rounded border border-neutral-600 px-2 text-neutral-300 hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-blue-300"
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              {slidersOpen ? (
                <ChevronDown className="size-3" aria-hidden="true" />
              ) : (
                <ChevronRight className="size-3" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>
    </RecorderPanel>
  );
}

const formatParameter = (value: number) => String(Number(value.toFixed(2)));

function EqNumericInput({
  label,
  unit,
  limits,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  limits: { min: number; max: number; step: number };
  value: number;
  onChange: (value: number) => void;
}) {
  const input = useDraftInput({
    value,
    onCommit: onChange,
    ...limits,
    parse: "float",
    format: formatParameter,
  });
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-xs">
      <span className="text-muted-foreground">
        {label}
        {unit && ` (${unit})`}
      </span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        className="h-7 w-full rounded border border-neutral-600 bg-neutral-900 px-1 text-right font-mono text-xs focus:border-neutral-500 focus:outline-none"
        {...input.props}
      />
    </label>
  );
}

function EqSlider({
  label,
  unit,
  limits,
  scale = "linear",
  value,
  onChange,
}: {
  label: string;
  unit: string;
  limits: { min: number; max: number; step: number };
  scale?: "linear" | "logarithmic";
  value: number;
  onChange: (value: number) => void;
}) {
  let config = {
    ...limits,
    toSliderValue: (value: number) => value,
    toParameterValue: (value: number) => value,
  };
  if (scale === "logarithmic") {
    const logRange = Math.log(limits.max / limits.min);
    config = {
      min: 0,
      max: 1,
      // 1,000 steps across 20–20,000 Hz gives about 100 steps per octave.
      // With frequency = min * (max / min)^position, n steps multiply it by
      // (max / min)^(n * step). Doubling therefore requires
      // (max / min)^(n * step) = 2, so n * step * log(max / min) = log(2).
      // Thus n = log(2) / (0.001 * log(20000 / 20)) ≈ 100.
      step: 0.001,
      // (log(value) - log(min)) / (log(max) - log(min))
      // = log(value / min) / log(max / min); solve for value for the inverse.
      toSliderValue: (value: number) => Math.log(value / limits.min) / logRange,
      toParameterValue: (position: number) =>
        Number((limits.min * Math.exp(position * logRange)).toFixed(2)),
    };
  }
  const valueText = `${formatParameter(value)} ${unit}`.trim();
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono">{valueText}</span>
      </div>
      <Slider
        aria-label={label}
        aria-valuetext={valueText}
        min={config.min}
        max={config.max}
        step={config.step}
        value={[config.toSliderValue(value)]}
        onValueChange={([next]) => onChange(config.toParameterValue(next))}
      />
    </div>
  );
}
