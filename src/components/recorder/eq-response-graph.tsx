import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffectEvent,
} from "react";
import {
  calculateBiquadEqCoefficients,
  calculateBiquadEqResponse,
} from "../../lib/dsp/biquad-eq";
import { type MultibandEqBand } from "../../lib/dsp/biquad-eq-multiband";
import { clamp, dbToGain, gainToDb } from "../../lib/music";
import { EQ_CONTROL_LIMITS } from "./eq-control-limits";

const GRAPH_SAMPLE_RATE = 48000;
const FREQUENCY_TICKS = [20, 100, 1000, 10000, 20000];
const GAIN_TICKS = [-18, -12, -6, 0, 6, 12, 18];
export const EQ_BAND_COLORS = [
  "#60a5fa",
  "#f472b6",
  "#fbbf24",
  "#34d399",
  "#a78bfa",
  "#fb7185",
  "#22d3ee",
  "#a3e635",
];

export function EqResponseGraph({
  bands,
  selectedBandId,
  bypass,
  onSelectBand,
  onBandChange,
}: {
  bands: MultibandEqBand[];
  selectedBandId?: string;
  bypass: boolean;
  onSelectBand: (id: string) => void;
  onBandChange: (
    id: string,
    update: Partial<Omit<MultibandEqBand, "id">>,
  ) => void;
}) {
  const bandResponses = bands.map((band) => ({
    band,
    path: createResponsePath([band]),
  }));
  const combinedPath = createResponsePath(bands.filter((band) => !band.bypass));

  // Pointer edits map the plot position back to frequency and gain.
  const updateFromPointer = (
    event: ReactPointerEvent<HTMLButtonElement>,
    id: string,
  ) => {
    const plot = event.currentTarget.parentElement!;
    const bounds = plot.getBoundingClientRect();
    const x = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    const y = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
    const frequency = Math.round(graphXToFrequency(x));
    const step = EQ_CONTROL_LIMITS.gainDb.step;
    const gainDb = Math.round(graphYToGainDb(y) / step) * step;
    onBandChange(id, { frequency, gain: dbToGain(gainDb) });
  };

  // Wheel gestures adjust Q independently of the point position.
  const handleWheel = useEffectEvent((event: WheelEvent) => {
    if (
      !selectedBandId ||
      event.ctrlKey ||
      event.metaKey ||
      event.deltaY === 0
    ) {
      return;
    }
    const band = bands.find((entry) => entry.id === selectedBandId);
    if (!band) {
      return;
    }
    event.preventDefault();
    const q = clamp(
      band.q * Math.exp(event.deltaY * 0.002),
      EQ_CONTROL_LIMITS.q.min,
      EQ_CONTROL_LIMITS.q.max,
    );
    onBandChange(selectedBandId, { q });
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
      aria-label="Multiband EQ response graph"
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
      <div ref={graphRef} className="relative min-h-0 min-w-0 touch-none">
        <svg
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          className="pointer-events-none absolute size-full overflow-hidden"
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
          {bandResponses.map(({ band, path }, index) => (
            <path
              key={band.id}
              data-testid="eq-band-curve"
              d={path}
              fill="none"
              stroke={EQ_BAND_COLORS[index]}
              strokeOpacity={
                band.bypass ? 0.18 : band.id === selectedBandId ? 0.8 : 0.35
              }
              strokeWidth={band.id === selectedBandId ? 1.5 : 1}
              strokeDasharray={band.bypass ? "3 3" : undefined}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path
            data-testid="eq-combined-curve"
            d={combinedPath}
            fill="none"
            className="stroke-neutral-100"
            strokeOpacity={bypass ? 0.25 : 0.9}
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {bands.map((band, index) => {
          const selected = band.id === selectedBandId;
          return (
            <button
              key={band.id}
              type="button"
              data-testid="eq-response-point"
              aria-label={`Select and edit band ${index + 1}`}
              aria-pressed={selected}
              onPointerDown={(event) => {
                if (event.button !== 0) {
                  return;
                }
                event.currentTarget.setPointerCapture(event.pointerId);
                onSelectBand(band.id);
                updateFromPointer(event, band.id);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  updateFromPointer(event, band.id);
                }
              }}
              className="absolute flex size-5 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border-2 bg-neutral-900 text-[9px] font-semibold text-neutral-100 shadow-sm outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-white active:cursor-grabbing aria-pressed:scale-110"
              style={{
                left: `${frequencyToGraphX(band.frequency) * 100}%`,
                top: `${gainDbToGraphY(gainToDb(band.gain)) * 100}%`,
                borderColor: EQ_BAND_COLORS[index],
                opacity: band.bypass ? 0.45 : 1,
              }}
            >
              {index + 1}
            </button>
          );
        })}
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

function createResponsePath(bands: MultibandEqBand[]): string {
  // The plot uses normalized log-frequency and gain coordinates from 0 to 1.
  const bandCoefficients = bands.map((band) =>
    calculateBiquadEqCoefficients({
      sampleRate: GRAPH_SAMPLE_RATE,
      frequency: band.frequency,
      gain: band.gain,
      q: band.q,
    }),
  );
  return Array.from({ length: 161 }, (_, index) => {
    const x = index / 160;
    const frequency = graphXToFrequency(x);
    let totalGainDb = 0;
    for (const coefficients of bandCoefficients) {
      const bandGain = calculateBiquadEqResponse({
        coefficients,
        sampleRate: GRAPH_SAMPLE_RATE,
        frequency,
      });
      totalGainDb += gainToDb(bandGain);
    }
    return `${index === 0 ? "M" : "L"}${x.toFixed(5)},${gainDbToGraphY(totalGainDb).toFixed(5)}`;
  }).join(" ");
}

function frequencyToGraphX(frequency: number): number {
  const { min, max } = EQ_CONTROL_LIMITS.frequency;
  return Math.log(frequency / min) / Math.log(max / min);
}

function graphXToFrequency(x: number): number {
  const { min, max } = EQ_CONTROL_LIMITS.frequency;
  return min * (max / min) ** x;
}

function gainDbToGraphY(gainDb: number): number {
  const { min, max } = EQ_CONTROL_LIMITS.gainDb;
  return (max - gainDb) / (max - min);
}

function graphYToGainDb(y: number): number {
  const { min, max } = EQ_CONTROL_LIMITS.gainDb;
  return max - y * (max - min);
}

function formatFrequencyTick(frequency: number): string {
  return frequency >= 1000 ? `${frequency / 1000}k` : String(frequency);
}
