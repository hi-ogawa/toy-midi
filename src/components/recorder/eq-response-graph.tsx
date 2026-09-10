import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffectEvent,
} from "react";
import {
  calculatePeakingEqCoefficients,
  calculatePeakingEqResponse,
  type EqParameters,
} from "../../lib/dsp/eq";
import { EQ_LIMITS } from "../../lib/dsp/eq";
import { clamp, dbToGain, gainToDb } from "../../lib/music";
import { EQ_CONTROL_LIMITS } from "./eq-control-limits";

const GRAPH_SAMPLE_RATE = 48000;
const FREQUENCY_TICKS = [20, 100, 1000, 10000, 20000];
const GAIN_TICKS = [-18, -12, -6, 0, 6, 12, 18];

export function EqResponseGraph({
  eq,
  onChange,
}: {
  eq: EqParameters;
  onChange: (update: Partial<EqParameters>) => void;
}) {
  // The plot uses normalized log-frequency and gain coordinates from 0 to 1.
  const coefficients = calculatePeakingEqCoefficients({
    sampleRate: GRAPH_SAMPLE_RATE,
    frequency: eq.frequency,
    gain: eq.gain,
    q: eq.q,
  });
  const responsePath = Array.from({ length: 161 }, (_, index) => {
    const x = index / 160;
    const frequency = graphXToFrequency(x);
    const gainDb = gainToDb(
      calculatePeakingEqResponse({
        coefficients,
        sampleRate: GRAPH_SAMPLE_RATE,
        frequency,
      }),
    );
    return `${index === 0 ? "M" : "L"}${x.toFixed(5)},${gainDbToGraphY(gainDb).toFixed(5)}`;
  }).join(" ");

  // Pointer edits map the plot position back to frequency and gain.
  const updateFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    const y = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
    const frequency = Math.round(graphXToFrequency(x));
    const step = EQ_CONTROL_LIMITS.gainDb.step;
    const gainDb = Math.round(graphYToGainDb(y) / step) * step;
    onChange({ frequency, gain: dbToGain(gainDb) });
  };

  // Wheel gestures adjust Q independently of the point position.
  const handleWheel = useEffectEvent((event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey || event.deltaY === 0) {
      return;
    }
    event.preventDefault();
    const q = clamp(
      eq.q * Math.exp(-event.deltaY * 0.002),
      EQ_LIMITS.q.min,
      EQ_LIMITS.q.max,
    );
    onChange({ q });
  });
  const graphRef = useCallback(
    (graph: HTMLDivElement | null) => {
      if (!graph) {
        return;
      }
      // A non-passive listener consumes Q gestures without scrolling the panel.
      graph.addEventListener("wheel", handleWheel, { passive: false });
      return () => graph.removeEventListener("wheel", handleWheel);
    },
    [handleWheel],
  );

  // Axis labels sit outside the measured plot, so layout does not affect gestures.
  return (
    <div
      data-testid="eq-response-graph"
      aria-label="EQ response graph"
      className="grid aspect-[8/5] w-full grid-cols-[34px_1fr] grid-rows-[1fr_22px] rounded border border-neutral-700 bg-neutral-900 pt-2 pr-2 text-[9px] text-neutral-500 select-none"
    >
      <div className="relative">
        {GAIN_TICKS.map((gainDb) => (
          <span
            key={gainDb}
            className="absolute right-1.5 -translate-y-1/2"
            style={{ top: `${gainDbToGraphY(gainDb) * 100}%` }}
          >
            {gainDb > 0 ? `+${gainDb}` : gainDb}
          </span>
        ))}
      </div>
      <div
        ref={graphRef}
        className="relative min-h-0 min-w-0 touch-none cursor-crosshair"
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
        <svg
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          className="pointer-events-none absolute size-full overflow-visible"
          aria-hidden="true"
        >
          {GAIN_TICKS.map((gainDb) => (
            <line
              key={gainDb}
              x1={0}
              x2={1}
              y1={gainDbToGraphY(gainDb)}
              y2={gainDbToGraphY(gainDb)}
              className={
                gainDb === 0 ? "stroke-neutral-500" : "stroke-neutral-700"
              }
              strokeWidth={gainDb === 0 ? 1 : 0.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {FREQUENCY_TICKS.map((frequency) => (
            <line
              key={frequency}
              x1={frequencyToGraphX(frequency)}
              x2={frequencyToGraphX(frequency)}
              y1={0}
              y2={1}
              className="stroke-neutral-700"
              strokeWidth={0.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path
            data-testid="eq-response-curve"
            d={responsePath}
            fill="none"
            className={eq.bypass ? "stroke-blue-400/35" : "stroke-blue-400"}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span
          data-testid="eq-response-point"
          className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-300 bg-neutral-900"
          style={{
            left: `${frequencyToGraphX(eq.frequency) * 100}%`,
            top: `${gainDbToGraphY(gainToDb(eq.gain)) * 100}%`,
          }}
        />
      </div>
      <div className="relative col-start-2">
        {FREQUENCY_TICKS.map((frequency) => (
          <span
            key={frequency}
            className="absolute top-1 -translate-x-1/2"
            style={{ left: `${frequencyToGraphX(frequency) * 100}%` }}
          >
            {formatFrequencyTick(frequency)}
          </span>
        ))}
      </div>
    </div>
  );
}

function frequencyToGraphX(frequency: number): number {
  const { min, max } = EQ_LIMITS.frequency;
  return Math.log(frequency / min) / Math.log(max / min);
}

function graphXToFrequency(x: number): number {
  const { min, max } = EQ_LIMITS.frequency;
  return min * (max / min) ** x;
}

function gainDbToGraphY(gainDb: number): number {
  const { min, max } = EQ_LIMITS.gainDb;
  return (max - gainDb) / (max - min);
}

function graphYToGainDb(y: number): number {
  const { min, max } = EQ_LIMITS.gainDb;
  return max - y * (max - min);
}

function formatFrequencyTick(frequency: number): string {
  return frequency >= 1000 ? `${frequency / 1000}k` : String(frequency);
}
