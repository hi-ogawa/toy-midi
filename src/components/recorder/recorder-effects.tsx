import { useDraftInput } from "../../hooks/use-draft-input";
import { createDefaultEq } from "../../lib/dsp/biquad-eq-node";
import { EQ_LIMITS, type EqParameters, type EqType } from "../../lib/dsp/eq";
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
          <h3 className="text-sm font-medium">EQ</h3>
          <button
            onClick={() => onChange(createDefaultEq())}
            className="rounded border border-neutral-600 px-2 py-1 text-xs hover:bg-neutral-700"
          >
            Reset
          </button>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <span className="mr-auto">Filter type</span>
          <select
            aria-label="Filter type"
            className="h-7 rounded border border-neutral-600 bg-neutral-900 px-1 text-xs"
            value={eq.type}
            onChange={(event) =>
              onChange({ type: event.target.value as EqType })
            }
          >
            <option value="peaking">Peaking</option>
            <option value="low-shelf">Low shelf</option>
            <option value="high-shelf">High shelf</option>
            <option value="low-pass">Low pass</option>
            <option value="high-pass">High pass</option>
            <option value="band-pass">Band pass</option>
            <option value="notch">Notch</option>
          </select>
        </label>
        <EqParameter
          label="Frequency"
          unit="Hz"
          limits={{ ...EQ_LIMITS.frequency, step: 1 }}
          scale="logarithmic"
          value={eq.frequency}
          onChange={(frequency) => onChange({ frequency })}
        />
        {(eq.type === "peaking" || eq.type.endsWith("shelf")) && (
          <EqParameter
            label="Gain"
            unit="dB"
            limits={{ ...EQ_LIMITS.gainDb, step: 0.5 }}
            value={gainToDb(eq.gain)}
            onChange={(gainDb) => onChange({ gain: dbToGain(gainDb) })}
          />
        )}
        {!eq.type.endsWith("shelf") && (
          <EqParameter
            label="Q"
            unit=""
            limits={{ ...EQ_LIMITS.q, step: 0.1 }}
            value={eq.q}
            onChange={(q) => onChange({ q })}
          />
        )}
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
  limits: { min: number; max: number; step: number };
  scale?: "linear" | "logarithmic";
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
        min={config.min}
        max={config.max}
        step={config.step}
        value={[config.toSliderValue(value)]}
        onValueChange={([next]) => onChange(config.toParameterValue(next))}
      />
    </div>
  );
}
