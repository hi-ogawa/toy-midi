import { useDraftInput } from "../../hooks/use-draft-input";
import type { EqParameters } from "../../lib/dsp/eq";
import {
  createDefaultPeakingEq,
  EQ_LIMITS,
} from "../../lib/dsp/peaking-eq-node";
import { dbToGain, gainToDb } from "../../lib/music";
import { Slider } from "../ui/slider";
import { RecorderPanel } from "./recorder-panel";

const FREQUENCY_CONFIG = createLogarithmicParameterConfig(EQ_LIMITS.frequency);
const GAIN_CONFIG = createLinearParameterConfig(EQ_LIMITS.gainDb);
const Q_CONFIG = createLinearParameterConfig(EQ_LIMITS.q);

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
          config={FREQUENCY_CONFIG}
          value={eq.frequency}
          onChange={(frequency) => onChange({ frequency })}
        />
        <EqParameter
          label="Gain"
          unit="dB"
          config={GAIN_CONFIG}
          value={gainToDb(eq.gain)}
          onChange={(gainDb) => onChange({ gain: dbToGain(gainDb) })}
        />
        <EqParameter
          label="Q"
          unit=""
          config={Q_CONFIG}
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
  config,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  config: ParameterConfig;
  value: number;
  onChange: (value: number) => void;
}) {
  const input = useDraftInput({
    value,
    onCommit: onChange,
    min: config.min,
    max: config.max,
    step: config.step,
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

type ParameterConfig = {
  min: number;
  max: number;
  step: number;
  sliderMin: number;
  sliderMax: number;
  sliderStep: number;
  toSliderValue: (value: number) => number;
  toParameterValue: (value: number) => number;
};

function createLinearParameterConfig({
  min,
  max,
  step,
}: {
  min: number;
  max: number;
  step: number;
}): ParameterConfig {
  return {
    min,
    max,
    step,
    sliderMin: min,
    sliderMax: max,
    sliderStep: step,
    toSliderValue: (value) => value,
    toParameterValue: (value) => value,
  };
}

function createLogarithmicParameterConfig({
  min,
  max,
  step,
}: {
  min: number;
  max: number;
  step: number;
}): ParameterConfig {
  return {
    min,
    max,
    step,
    sliderMin: 0,
    sliderMax: 1,
    sliderStep: 0.001,
    toSliderValue: (value) => Math.log10(value / min) / Math.log10(max / min),
    toParameterValue: (position) =>
      Number((min * (max / min) ** position).toFixed(2)),
  };
}
