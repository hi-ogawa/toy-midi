import { useDraftInput } from "../../hooks/use-draft-input";
import type { EqParameters } from "../../lib/dsp/eq";
import {
  createDefaultPeakingEq,
  EQ_LIMITS,
} from "../../lib/dsp/peaking-eq-node";
import { dbToGain, gainToDb } from "../../lib/music";
import { Slider } from "../ui/slider";
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
  return (
    <RecorderPanel
      title={`${label} Effects`}
      closeLabel={`Close ${label} Effects`}
      onClose={onClose}
      testId="recorder-effects-panel"
      className="pointer-events-auto w-64 shrink-0"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Peaking EQ</h3>
          <button
            onClick={() => onChange(createDefaultPeakingEq())}
            className="rounded border border-neutral-600 px-2 py-1 text-xs hover:bg-neutral-700"
          >
            Reset
          </button>
        </div>
        <EqParameter
          label="Frequency"
          unit="Hz"
          limits={EQ_LIMITS.frequency}
          scale="logarithmic"
          value={eq.frequency}
          onChange={(frequency) => onChange({ frequency })}
        />
        <EqParameter
          label="Gain"
          unit="dB"
          limits={EQ_LIMITS.gainDb}
          value={gainToDb(eq.gain)}
          onChange={(gainDb) => onChange({ gain: dbToGain(gainDb) })}
        />
        <EqParameter
          label="Q"
          unit=""
          limits={EQ_LIMITS.q}
          value={eq.q}
          onChange={(q) => onChange({ q })}
        />
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={eq.bypass}
            onChange={(event) => onChange({ bypass: event.target.checked })}
          />
          Bypass
        </label>
      </div>
    </RecorderPanel>
  );
}

const formatParameter = (value: number) => String(Number(value.toFixed(2)));

function EqParameter({
  label,
  unit,
  limits,
  scale = "linear",
  value,
  onChange,
}: {
  label: string;
  unit: string;
  limits: ParameterLimits;
  scale?: "linear" | "logarithmic";
  value: number;
  onChange: (value: number) => void;
}) {
  const { min, max, step } = limits;
  const config: ParameterConfig =
    scale === "logarithmic"
      ? {
          sliderMin: 0,
          sliderMax: 1,
          sliderStep: 0.001,
          // Start with geometric interpolation: value = min * (max / min) ** p.
          // Taking logs and solving for p gives log(value / min) / log(max / min).
          toSliderValue: (value) =>
            Math.log10(value / min) / Math.log10(max / min),
          toParameterValue: (position) =>
            Number((min * (max / min) ** position).toFixed(2)),
        }
      : {
          sliderMin: min,
          sliderMax: max,
          sliderStep: step,
          toSliderValue: (value) => value,
          toParameterValue: (value) => value,
        };
  const input = useDraftInput({
    value,
    onCommit: onChange,
    min,
    max,
    step,
    parse: "float",
    format: formatParameter,
  });
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-xs">
        <span className="mr-auto">{label}</span>
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          className="h-6 w-16 rounded border border-neutral-600 bg-neutral-900 px-1 text-right font-mono text-xs focus:border-neutral-500 focus:outline-none"
          {...input.props}
        />
        {unit && <span className="w-4 text-muted-foreground">{unit}</span>}
      </label>
      <Slider
        aria-label={label}
        aria-valuetext={`${formatParameter(value)} ${unit}`.trim()}
        value={[config.toSliderValue(value)]}
        min={config.sliderMin}
        max={config.sliderMax}
        step={config.sliderStep}
        onValueChange={([next]) => onChange(config.toParameterValue(next))}
      />
    </div>
  );
}

type ParameterLimits = {
  min: number;
  max: number;
  step: number;
};

type ParameterConfig = {
  sliderMin: number;
  sliderMax: number;
  sliderStep: number;
  toSliderValue: (value: number) => number;
  toParameterValue: (value: number) => number;
};
