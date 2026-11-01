import type { Envelope } from "../lib/dsp/envelope";
import { clamp, logPositionToValue, valueToLogPosition } from "../lib/music";
import { usePointerDrag } from "./use-pointer-drag";

const TIME_RANGE = { min: 0.001, max: 10 };
// The sustain has no time of its own, so it gets a fixed stretch of the graph
// between the decay and the release.
const HOLD_WIDTH = 0.16;
const STAGE_WIDTH = (1 - HOLD_WIDTH) / 3;

// Literal class names, so Tailwind finds them
const COLOR_CLASSES = {
  emerald: { fill: "fill-emerald-500/15", stroke: "stroke-emerald-500" },
  amber: { fill: "fill-amber-500/15", stroke: "stroke-amber-500" },
};

/**
 * An ADSR graph with a handle at the end of each timed stage, and a readout
 * per parameter for exact values. Each stage's width follows a log scale from
 * 1 ms to 10 s, so a 5 ms attack and a 2 s release both stay visible.
 */
export function EnvelopeEditor({
  label,
  color,
  envelope,
  onChange,
}: {
  label: string;
  color: keyof typeof COLOR_CLASSES;
  envelope: Envelope;
  onChange: (update: Partial<Envelope>) => void;
}) {
  const attackX = STAGE_WIDTH * timeToPosition(envelope.attack);
  const decayX = attackX + STAGE_WIDTH * timeToPosition(envelope.decay);
  const sustainX = decayX + HOLD_WIDTH;
  const releaseX = sustainX + STAGE_WIDTH * timeToPosition(envelope.release);
  const sustainY = 1 - envelope.sustain;
  const curve = [
    "M 0 1",
    `L ${attackX} 0`,
    `Q ${attackX + (decayX - attackX) * 0.1} ${sustainY} ${decayX} ${sustainY}`,
    `L ${sustainX} ${sustainY}`,
    `Q ${sustainX + (releaseX - sustainX) * 0.1} 1 ${releaseX} 1`,
  ].join(" ");

  return (
    <div role="group" aria-label={label} className="space-y-1">
      <div className="relative h-16 rounded border border-neutral-700 bg-neutral-900 select-none">
        <div className="absolute inset-x-2 inset-y-1.5">
          <svg
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            className="pointer-events-none absolute size-full overflow-visible"
            aria-hidden="true"
          >
            <line
              x1={sustainX}
              x2={sustainX}
              y1={0}
              y2={1}
              className="stroke-neutral-700"
              strokeDasharray="2 2"
              vectorEffect="non-scaling-stroke"
            />
            <path d={`${curve} Z`} className={COLOR_CLASSES[color].fill} />
            <path
              d={curve}
              fill="none"
              className={COLOR_CLASSES[color].stroke}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <EnvelopeHandle
            stage="attack"
            x={attackX}
            y={0}
            onMove={({ x }) =>
              onChange({ attack: positionToTime(x / STAGE_WIDTH) })
            }
          />
          <EnvelopeHandle
            stage="decay"
            x={decayX}
            y={sustainY}
            onMove={({ x, y }) =>
              onChange({
                decay: positionToTime((x - attackX) / STAGE_WIDTH),
                sustain: Math.round((1 - y) * 100) / 100,
              })
            }
          />
          <EnvelopeHandle
            stage="release"
            x={releaseX}
            y={1}
            onMove={({ x }) =>
              onChange({
                release: positionToTime((x - sustainX) / STAGE_WIDTH),
              })
            }
          />
        </div>
      </div>
      <div className="flex justify-between">
        <TimeReadout
          label="Attack"
          value={envelope.attack}
          onChange={(attack) => onChange({ attack })}
        />
        <TimeReadout
          label="Decay"
          value={envelope.decay}
          onChange={(decay) => onChange({ decay })}
        />
        <Readout
          label="Sustain"
          valueText={`${Math.round(envelope.sustain * 100)}%`}
          position={envelope.sustain}
          step={0.01}
          onChange={(position) =>
            onChange({ sustain: Math.round(position * 100) / 100 })
          }
        />
        <TimeReadout
          label="Release"
          value={envelope.release}
          onChange={(release) => onChange({ release })}
        />
      </div>
    </div>
  );
}

/**
 * Dragging moves the handle by the pointer's movement, in fractions of the
 * plot, so the handle doesn't jump to the pointer.
 */
function EnvelopeHandle({
  stage,
  x,
  y,
  onMove,
}: {
  stage: "attack" | "decay" | "release";
  x: number;
  y: number;
  onMove: (position: { x: number; y: number }) => void;
}) {
  const ref = usePointerDrag({
    onStart: (event) => {
      const plot = (event.currentTarget as HTMLElement).parentElement!;
      return { bounds: plot.getBoundingClientRect(), x, y };
    },
    onMove: (_event, { data, deltaX, deltaY }) =>
      onMove({
        x: data.x + deltaX / data.bounds.width,
        y: clamp(data.y + deltaY / data.bounds.height, 0, 1),
      }),
  });
  return (
    <div
      ref={ref}
      data-testid={`envelope-${stage}-handle`}
      className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-[1.5px] border-neutral-100 bg-neutral-900 hover:scale-125 active:cursor-grabbing"
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
    />
  );
}

function TimeReadout({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Readout
      label={label}
      valueText={
        value < 1
          ? `${Number((value * 1000).toPrecision(2))} ms`
          : `${Number(value.toPrecision(2))} s`
      }
      position={timeToPosition(value)}
      // A tenth of a decade, log(10^0.1) / log(10 / 0.001) = 0.025 of the range,
      // which stays above the rounding to two digits.
      step={0.025}
      onChange={(position) => onChange(positionToTime(position))}
    />
  );
}

/**
 * A value that scrubs like a knob: drag up or down, or use the arrow keys,
 * with Shift for ten steps at a time. The position runs from 0 to 1.
 */
function Readout({
  label,
  valueText,
  position,
  step,
  onChange,
}: {
  label: string;
  valueText: string;
  position: number;
  step: number;
  onChange: (position: number) => void;
}) {
  const setPosition = (next: number) => onChange(clamp(next, 0, 1));
  // About 200px of vertical drag covers the full range.
  const ref = usePointerDrag({
    onStart: (event) => {
      (event.currentTarget as HTMLElement).focus();
      return position;
    },
    onMove: (_event, drag) => setPosition(drag.data - drag.deltaY / 200),
  });
  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuetext={valueText}
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={position}
      onKeyDown={(event) => {
        const amount = event.shiftKey ? 10 * step : step;
        const next = {
          ArrowLeft: position - amount,
          ArrowDown: position - amount,
          ArrowRight: position + amount,
          ArrowUp: position + amount,
          Home: 0,
          End: 1,
        }[event.key];
        if (next !== undefined) {
          event.preventDefault();
          setPosition(next);
        }
      }}
      className="cursor-ns-resize touch-none rounded-sm text-[11px] outline-none select-none focus-visible:ring-2 focus-visible:ring-blue-300"
    >
      <span className="text-muted-foreground">{label[0]} </span>
      <span className="border-b border-dotted border-neutral-500 font-mono text-neutral-200 tabular-nums">
        {valueText}
      </span>
    </div>
  );
}

function timeToPosition(time: number): number {
  return clamp(valueToLogPosition(time, TIME_RANGE), 0, 1);
}

function positionToTime(position: number): number {
  const time = logPositionToValue(clamp(position, 0, 1), TIME_RANGE);
  return Number(time.toPrecision(2));
}
