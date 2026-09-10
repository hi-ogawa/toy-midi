import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useEffectEvent,
  useRef,
} from "react";
import {
  calculatePeakingEqCoefficients,
  calculatePeakingEqResponse,
  type EqParameters,
} from "../../lib/dsp/eq";
import { EQ_LIMITS } from "../../lib/dsp/eq";
import { dbToGain, gainToDb } from "../../lib/music";
import { EQ_CONTROL_LIMITS } from "./eq-control-limits";

const GRAPH_SAMPLE_RATE = 48000;
const GRAPH_WIDTH = 320;
const GRAPH_HEIGHT = 152;
const GRAPH_BOUNDS = { left: 34, right: 8, top: 8, bottom: 22 };
const FREQUENCY_TICKS = [20, 100, 1000, 10000, 20000];
const GAIN_TICKS = [-18, -9, 0, 9, 18];

export function EqResponseGraph({
  eq,
  onChange,
}: {
  eq: EqParameters;
  onChange: (update: Partial<EqParameters>) => void;
}) {
  const graphRef = useRef<SVGSVGElement | null>(null);
  const handleWheel = useEffectEvent((event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey || event.deltaY === 0) {
      return;
    }
    event.preventDefault();
    const unit =
      event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? GRAPH_HEIGHT : 1;
    const q = clamp(
      eq.q * Math.exp(-event.deltaY * unit * 0.002),
      EQ_LIMITS.q.min,
      EQ_LIMITS.q.max,
    );
    onChange({ q });
  });
  useEffect(() => {
    const graph = graphRef.current!;
    // A non-passive listener consumes Q gestures without scrolling the panel.
    graph.addEventListener("wheel", handleWheel, { passive: false });
    return () => graph.removeEventListener("wheel", handleWheel);
  }, []);

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
    const gainDb = gainToDb(
      calculatePeakingEqResponse({
        coefficients,
        sampleRate: GRAPH_SAMPLE_RATE,
        frequency,
      }),
    );
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
    const step = EQ_CONTROL_LIMITS.gainDb.step;
    const gainDb = Math.round(graphYToGainDb(y) / step) * step;
    onChange({ frequency, gain: dbToGain(gainDb) });
  };

  return (
    <svg
      ref={graphRef}
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
