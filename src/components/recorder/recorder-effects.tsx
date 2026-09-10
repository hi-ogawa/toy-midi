import { type PointerEvent as ReactPointerEvent, useState } from "react";
import { useDraftInput } from "../../hooks/use-draft-input";
import {
  calculatePeakingEqCoefficients,
  calculatePeakingEqResponseDb,
  type EqParameters,
} from "../../lib/dsp/eq";
import {
  createDefaultPeakingEq,
  EQ_LIMITS,
} from "../../lib/dsp/peaking-eq-node";
import { dbToGain, gainToDb } from "../../lib/music";
import { Slider } from "../ui/slider";
import { cn } from "../ui/utils";
import { RecorderPanel } from "./recorder-panel";

const GRAPH_SAMPLE_RATE = 48000;
const GRAPH_WIDTH = 320;
const GRAPH_HEIGHT = 152;
const GRAPH_BOUNDS = { left: 34, right: 8, top: 8, bottom: 22 };
const FREQUENCY_TICKS = [20, 100, 1000, 10000, 20000];
const GAIN_TICKS = [-18, -9, 0, 9, 18];

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
  const [mode, setMode] = useState<"sliders" | "graph">("sliders");
  return (
    <RecorderPanel
      title={`${label} Effects`}
      closeLabel={`Close ${label} Effects`}
      onClose={onClose}
      testId="recorder-effects-panel"
      className={cn(
        "pointer-events-auto shrink-0 transition-[width]",
        mode === "sliders" ? "w-64" : "w-96",
      )}
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
        <div
          role="group"
          aria-label="EQ edit mode"
          className="grid grid-cols-2 rounded border border-neutral-600 p-0.5 text-xs"
        >
          {(["sliders", "graph"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              className="rounded px-2 py-1 text-neutral-400 hover:text-neutral-100 aria-pressed:bg-neutral-600 aria-pressed:text-neutral-100"
              onClick={() => setMode(value)}
            >
              {value === "sliders" ? "Sliders" : "Graph"}
            </button>
          ))}
        </div>
        {mode === "sliders" ? (
          <div className="space-y-4">
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
          </div>
        ) : (
          <div className="space-y-3">
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
          </div>
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

function EqResponseGraph({
  eq,
  onChange,
}: {
  eq: EqParameters;
  onChange: (update: Partial<EqParameters>) => void;
}) {
  const coefficients = calculatePeakingEqCoefficients({
    sampleRate: GRAPH_SAMPLE_RATE,
    frequency: eq.frequency,
    gain: eq.gain,
    q: eq.q,
  });
  const responsePath = Array.from({ length: 161 }, (_, index) => {
    const x =
      GRAPH_BOUNDS.left +
      (index / 160) * (GRAPH_WIDTH - GRAPH_BOUNDS.left - GRAPH_BOUNDS.right);
    const frequency = graphXToFrequency(x);
    const gainDb = calculatePeakingEqResponseDb({
      coefficients,
      sampleRate: GRAPH_SAMPLE_RATE,
      frequency,
    });
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${gainDbToGraphY(gainDb).toFixed(2)}`;
  }).join(" ");
  const pointX = frequencyToGraphX(eq.frequency);
  const pointY = gainDbToGraphY(gainToDb(eq.gain));

  const updateFromPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x =
      GRAPH_BOUNDS.left +
      clamp(
        ((event.clientX - bounds.left) / bounds.width) * GRAPH_WIDTH -
          GRAPH_BOUNDS.left,
        0,
        GRAPH_WIDTH - GRAPH_BOUNDS.left - GRAPH_BOUNDS.right,
      );
    const y = clamp(
      ((event.clientY - bounds.top) / bounds.height) * GRAPH_HEIGHT,
      GRAPH_BOUNDS.top,
      GRAPH_HEIGHT - GRAPH_BOUNDS.bottom,
    );
    const frequency = Math.round(graphXToFrequency(x));
    const gainDb = Math.round(graphYToGainDb(y) * 2) / 2;
    onChange({ frequency, gain: dbToGain(gainDb) });
  };

  return (
    <svg
      data-testid="eq-response-graph"
      aria-label="EQ response graph"
      viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
      className="w-full touch-none cursor-crosshair select-none rounded border border-neutral-700 bg-neutral-900"
      onPointerDown={(event) => {
        if (event.button === 0) {
          event.currentTarget.setPointerCapture(event.pointerId);
          updateFromPointer(event);
        }
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          updateFromPointer(event);
        }
      }}
    >
      {GAIN_TICKS.map((gainDb) => {
        const y = gainDbToGraphY(gainDb);
        return (
          <g key={gainDb}>
            <line
              x1={GRAPH_BOUNDS.left}
              x2={GRAPH_WIDTH - GRAPH_BOUNDS.right}
              y1={y}
              y2={y}
              className={
                gainDb === 0 ? "stroke-neutral-500" : "stroke-neutral-700"
              }
              strokeWidth={gainDb === 0 ? 1 : 0.5}
            />
            <text
              x={GRAPH_BOUNDS.left - 5}
              y={y + 3}
              textAnchor="end"
              className="fill-neutral-500 text-[8px]"
            >
              {gainDb > 0 ? `+${gainDb}` : gainDb}
            </text>
          </g>
        );
      })}
      {FREQUENCY_TICKS.map((frequency) => {
        const x = frequencyToGraphX(frequency);
        return (
          <g key={frequency}>
            <line
              x1={x}
              x2={x}
              y1={GRAPH_BOUNDS.top}
              y2={GRAPH_HEIGHT - GRAPH_BOUNDS.bottom}
              className="stroke-neutral-700"
              strokeWidth={0.5}
            />
            <text
              x={x}
              y={GRAPH_HEIGHT - 7}
              textAnchor="middle"
              className="fill-neutral-500 text-[8px]"
            >
              {formatFrequencyTick(frequency)}
            </text>
          </g>
        );
      })}
      <path
        data-testid="eq-response-curve"
        d={responsePath}
        fill="none"
        className={eq.bypass ? "stroke-blue-400/35" : "stroke-blue-400"}
        strokeWidth={2}
      />
      <circle
        data-testid="eq-response-point"
        cx={pointX}
        cy={pointY}
        r={5}
        className="fill-neutral-900 stroke-blue-300"
        strokeWidth={2}
      />
    </svg>
  );
}

function frequencyToGraphX(frequency: number): number {
  const { min, max } = EQ_LIMITS.frequency;
  const position = Math.log(frequency / min) / Math.log(max / min);
  return (
    GRAPH_BOUNDS.left +
    position * (GRAPH_WIDTH - GRAPH_BOUNDS.left - GRAPH_BOUNDS.right)
  );
}

function graphXToFrequency(x: number): number {
  const { min, max } = EQ_LIMITS.frequency;
  const position =
    (x - GRAPH_BOUNDS.left) /
    (GRAPH_WIDTH - GRAPH_BOUNDS.left - GRAPH_BOUNDS.right);
  return min * Math.exp(position * Math.log(max / min));
}

function gainDbToGraphY(gainDb: number): number {
  const { min, max } = EQ_LIMITS.gainDb;
  const height = GRAPH_HEIGHT - GRAPH_BOUNDS.top - GRAPH_BOUNDS.bottom;
  return GRAPH_BOUNDS.top + ((max - gainDb) / (max - min)) * height;
}

function graphYToGainDb(y: number): number {
  const { min, max } = EQ_LIMITS.gainDb;
  const height = GRAPH_HEIGHT - GRAPH_BOUNDS.top - GRAPH_BOUNDS.bottom;
  return max - ((y - GRAPH_BOUNDS.top) / height) * (max - min);
}

function formatFrequencyTick(frequency: number): string {
  return frequency >= 1000 ? `${frequency / 1000}k` : String(frequency);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

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
  const { min, max, step } = limits;
  let config;
  if (scale === "logarithmic") {
    const logRange = Math.log(max / min);
    config = {
      sliderMin: 0,
      sliderMax: 1,
      sliderStep: 0.001,
      // (log(value) - log(min)) / (log(max) - log(min))
      // = log(value / min) / log(max / min); solve for value for the inverse.
      toSliderValue: (value: number) => Math.log(value / min) / logRange,
      toParameterValue: (position: number) =>
        Number((min * Math.exp(position * logRange)).toFixed(2)),
    };
  } else {
    config = {
      sliderMin: min,
      sliderMax: max,
      sliderStep: step,
      toSliderValue: (value: number) => value,
      toParameterValue: (value: number) => value,
    };
  }
  return (
    <div className="space-y-2">
      <EqNumericInput
        label={label}
        unit={unit}
        limits={limits}
        value={value}
        onChange={onChange}
      />
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
    <label className="flex min-w-0 items-center gap-2 text-xs">
      <span className="mr-auto truncate">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        className="h-6 w-16 rounded border border-neutral-600 bg-neutral-900 px-1 text-right font-mono text-xs focus:border-neutral-500 focus:outline-none"
        {...input.props}
      />
      {unit && <span className="w-4 text-muted-foreground">{unit}</span>}
    </label>
  );
}
