import { useCallback, useEffectEvent } from "react";
import {
  calculateBiquadEqCoefficients,
  calculateBiquadEqResponse,
  isGainFilter,
} from "../lib/dsp/biquad-eq";
import { type MultibandEqBand } from "../lib/dsp/biquad-eq-multiband";
import { clamp, dbToGain, gainToDb } from "../lib/music";
import { EQ_CONTROL_LIMITS } from "./eq-control-limits";
import { usePointerGesture } from "./use-pointer-gesture";

const GRAPH_SAMPLE_RATE = 48000;
const FREQUENCY_TICKS = [20, 100, 1000, 10000, 20000];
const GAIN_TICKS = [-18, -12, -6, 0, 6, 12, 18];
// Tailwind v3's 400 shades distinguish bands against the dark graph background.
export const EQ_BAND_COLORS = [
  "#60a5fa", // blue
  "#f472b6", // pink
  "#fbbf24", // amber
  "#34d399", // emerald
  "#a78bfa", // violet
  "#fb7185", // rose
  "#22d3ee", // cyan
  "#a3e635", // lime
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
      className="grid min-h-[100px] w-full flex-1 grid-cols-[34px_1fr] grid-rows-[1fr_22px] rounded border border-neutral-700 bg-neutral-900 pt-2 pr-2 text-[9px] text-neutral-500 select-none"
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
        {bands.map((band, index) => (
          <EqBandHandle
            key={band.id}
            band={band}
            index={index}
            selected={band.id === selectedBandId}
            onSelect={() => onSelectBand(band.id)}
            onChange={(update) => onBandChange(band.id, update)}
          />
        ))}
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

/**
 * Pressing a handle selects its band without changing it. Dragging moves the
 * band by the pointer's movement, so the band doesn't jump to the pointer.
 */
function EqBandHandle({
  band,
  index,
  selected,
  onSelect,
  onChange,
}: {
  band: MultibandEqBand;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (
    update: Partial<Pick<MultibandEqBand, "frequency" | "gain">>,
  ) => void;
}) {
  // A handle whose band has no gain rides the 0 dB line and drags only its
  // cutoff.
  const hasGain = isGainFilter(band.type);
  const x = frequencyToGraphX(band.frequency);
  const y = gainDbToGraphY(hasGain ? gainToDb(band.gain) : 0);
  const ref = usePointerGesture({
    onStart: (event) => {
      onSelect();
      const plot = (event.currentTarget as HTMLElement).parentElement!;
      return { bounds: plot.getBoundingClientRect(), x, y };
    },
    onDragMove: (_event, { data, deltaX, deltaY }) => {
      const nextX = clamp(data.x + deltaX / data.bounds.width, 0, 1);
      const nextY = clamp(data.y + deltaY / data.bounds.height, 0, 1);
      const frequency = Math.round(graphXToFrequency(nextX));
      if (!hasGain) {
        onChange({ frequency });
        return;
      }
      const step = EQ_CONTROL_LIMITS.gainDb.step;
      const gainDb = Math.round(graphYToGainDb(nextY) / step) * step;
      onChange({ frequency, gain: dbToGain(gainDb) });
    },
  });
  return (
    <button
      ref={ref}
      type="button"
      data-testid="eq-response-point"
      aria-label={`Select and edit band ${index + 1}`}
      aria-pressed={selected}
      className="absolute flex size-5 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border-2 bg-neutral-900 text-[9px] font-semibold text-neutral-100 shadow-sm outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-white active:cursor-grabbing aria-pressed:scale-110"
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        borderColor: EQ_BAND_COLORS[index],
        opacity: band.bypass ? 0.45 : 1,
      }}
    >
      {index + 1}
    </button>
  );
}

function createResponsePath(bands: MultibandEqBand[]): string {
  // The plot uses normalized log-frequency and gain coordinates from 0 to 1.
  const bandCoefficients = bands.map((band) =>
    calculateBiquadEqCoefficients({ sampleRate: GRAPH_SAMPLE_RATE }, band),
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
