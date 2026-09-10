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
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Q · Bandwidth</div>
          <Slider
            aria-label="Q"
            aria-valuetext={formatParameter(eq.q)}
            value={[eq.q]}
            min={EQ_LIMITS.q.min}
            max={EQ_LIMITS.q.max}
            step={EQ_LIMITS.q.step}
            onValueChange={([q]) => onChange({ q })}
          />
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
