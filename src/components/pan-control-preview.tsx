import { GaugeIcon, Music2Icon, Volume2Icon } from "lucide-react";
import {
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { clamp } from "../lib/music";
import { MetronomeIcon } from "./icons";
import { formatPan, MixerChannel, PanSlider } from "./mixer";
import { Slider } from "./ui/slider";
import { cn } from "./ui/utils";
import { usePointerDrag } from "./use-pointer-drag";

type PanControl = (props: {
  label: string;
  pan: number;
  onPanChange: (pan: number) => void;
}) => ReactNode;

const VARIANTS: { label: string; description: string; control: PanControl }[] =
  [
    {
      label: "Current",
      description:
        "Shared slider filled from the left edge, 16px thumb, readout beside it.",
      control: PanSlider,
    },
    {
      label: "A. Centered slider",
      description:
        "Same slider, filled from center to a 10px thumb, with a center tick.",
      control: CenteredPanSlider,
    },
    {
      label: "B. Pan bar",
      description:
        "Full-width bar filled from center, readout inside. Drag sideways from anywhere.",
      control: PanBar,
    },
    {
      label: "C. Knob",
      description:
        "24px knob with an arc from 12 o'clock. Drag up or down to turn it.",
      control: PanKnob,
    },
  ];

const ICON_CLASS = "size-4 text-muted-foreground";

export function PanControlPreview() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-neutral-400">
        The candidates recenter on double-click. Every control steps with the
        arrow keys (Shift for 10).
      </p>
      {VARIANTS.map((variant) => (
        <section key={variant.label} className="space-y-2">
          <h2 className="text-sm font-semibold">{variant.label}</h2>
          <p className="text-xs text-neutral-400">{variant.description}</p>
          <PreviewMixer control={variant.control} />
        </section>
      ))}
    </div>
  );
}

function PreviewMixer({ control: Control }: { control: PanControl }) {
  const [pans, setPans] = useState<Record<string, number>>({
    "MIDI 1": -0.4,
    "MIDI 2": 0,
    "Audio 2": 0.6,
  });
  return (
    <div className="flex w-max gap-8 rounded-lg border border-neutral-700 bg-neutral-800 px-4 pt-1 pb-3">
      <PreviewChannel
        icon={<GaugeIcon className={ICON_CLASS} />}
        label="Master"
      />
      {Object.entries(pans).map(([label, pan]) => (
        <PreviewChannel
          key={label}
          icon={
            label.startsWith("MIDI") ? (
              <Music2Icon className={ICON_CLASS} />
            ) : (
              <Volume2Icon className={ICON_CLASS} />
            )
          }
          label={label}
          pan={
            <Control
              label={label}
              pan={pan}
              onPanChange={(pan) =>
                setPans((pans) => ({ ...pans, [label]: pan }))
              }
            />
          }
        />
      ))}
      <PreviewChannel
        icon={<MetronomeIcon className={ICON_CLASS} />}
        label="Metro"
      />
    </div>
  );
}

function PreviewChannel({
  icon,
  label,
  pan,
}: {
  icon: ReactNode;
  label: string;
  pan?: ReactNode;
}) {
  const [gain, setGain] = useState(1);
  return (
    <MixerChannel
      icon={icon}
      label={label}
      pan={pan}
      gain={gain}
      onGainChange={setGain}
      inputProps={{ value: "0.0", readOnly: true }}
      data-testid={`preview-${label}`}
    />
  );
}

function CenteredPanSlider({
  label,
  pan,
  onPanChange,
}: Parameters<PanControl>[0]) {
  const offset = Math.abs(pan) / 2;
  return (
    <div className="flex w-full items-center gap-2">
      <div className="relative flex-1">
        {/* Radix keeps the thumb inside the track, so map the fill onto the
            thumb's 10px-inset travel to make it end under the thumb. */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-neutral-700">
          <div
            className="absolute inset-y-0 bg-primary"
            style={{
              left: pan < 0 ? `calc(50% - (100% - 10px) * ${offset})` : "50%",
              width: `calc((100% - 10px) * ${offset})`,
            }}
          />
          <div className="absolute top-1/2 left-1/2 h-3 w-px -translate-1/2 bg-neutral-400" />
        </div>
        <Slider
          value={[pan]}
          onValueChange={([value]) => onPanChange(value)}
          onDoubleClick={() => onPanChange(0)}
          min={-1}
          max={1}
          step={0.01}
          aria-label={`${label} pan`}
          aria-valuetext={formatPan(pan)}
          className="[&_[data-slot=slider-range]]:hidden [&_[data-slot=slider-thumb]]:size-2.5 [&_[data-slot=slider-track]]:bg-transparent"
        />
      </div>
      <span className="w-8 text-right font-mono text-xs text-muted-foreground tabular-nums">
        {formatPan(pan)}
      </span>
    </div>
  );
}

function PanBar({ label, pan, onPanChange }: Parameters<PanControl>[0]) {
  const input = usePanInput({ label, pan, onPanChange, axis: "x" });
  const offset = Math.abs(pan) * 50;
  return (
    <div
      {...input}
      className="relative h-[18px] w-full cursor-ew-resize touch-none overflow-hidden rounded bg-neutral-700 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
    >
      <div
        className="absolute inset-y-0 bg-primary/55"
        style={{ left: `${pan < 0 ? 50 - offset : 50}%`, width: `${offset}%` }}
      />
      <div className="absolute inset-y-0 left-1/2 w-px bg-neutral-400" />
      <span className="absolute inset-0 grid place-items-center font-mono text-[11px] text-neutral-100 [text-shadow:0_0_3px_black]">
        {formatPan(pan)}
      </span>
    </div>
  );
}

function PanKnob({ label, pan, onPanChange }: Parameters<PanControl>[0]) {
  const input = usePanInput({ label, pan, onPanChange, axis: "y" });
  return (
    // The side columns share the leftover width, so the knob lines up with the fader.
    <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2">
      <Knob
        {...input}
        value={pan}
        min={-1}
        max={1}
        origin={0}
        className="col-start-2 cursor-ns-resize"
      />
      <span className="font-mono text-xs text-muted-foreground tabular-nums">
        {formatPan(pan)}
      </span>
    </div>
  );
}

const SWEEP_DEGREES = 270;

/** Draws the knob only; the caller supplies the input behavior and ARIA through div props. */
function Knob({
  value,
  min,
  max,
  origin = min,
  className,
  ...props
}: ComponentProps<"div"> & {
  value: number;
  min: number;
  max: number;
  /** Where the value arc starts, such as the center of a pan knob */
  origin?: number;
}) {
  const toDegrees = (v: number) =>
    ((v - min) / (max - min) - 0.5) * SWEEP_DEGREES;
  const angle = toDegrees(value);
  const originAngle = toDegrees(origin);
  const start = getRimPoint(originAngle);
  const end = getRimPoint(angle);
  const largeArc = Math.abs(angle - originAngle) > 180 ? 1 : 0;
  const clockwise = angle > originAngle ? 1 : 0;
  return (
    <div
      className={cn(
        "size-6 shrink-0 touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-emerald-400",
        className,
      )}
      {...props}
    >
      <svg viewBox="0 0 24 24" className="size-full">
        <circle
          cx="12"
          cy="12"
          r="10"
          className="fill-neutral-900 stroke-neutral-700"
          strokeWidth="3"
        />
        {value !== origin && (
          <path
            d={`M ${start.x} ${start.y} A 10 10 0 ${largeArc} ${clockwise} ${end.x} ${end.y}`}
            fill="none"
            className="stroke-primary"
            strokeWidth="3"
          />
        )}
        <line
          x1="12"
          y1="12"
          x2="12"
          y2="4"
          transform={`rotate(${angle} 12 12)`}
          className="stroke-neutral-100"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

/** Point on the ring at an angle in degrees clockwise from 12 o'clock. */
function getRimPoint(degrees: number) {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return { x: 12 + 10 * Math.cos(radians), y: 12 + 10 * Math.sin(radians) };
}

/** Relative drag across about 200px covers the full range, whatever the control's size. */
function usePanInput({
  label,
  pan,
  onPanChange,
  axis,
}: Parameters<PanControl>[0] & { axis: "x" | "y" }) {
  const setPan = (value: number) =>
    onPanChange(clamp(Math.round(value * 100) / 100, -1, 1));
  const ref = usePointerDrag({
    onStart: (event) => {
      (event.currentTarget as HTMLElement).focus();
      return pan;
    },
    onMove: (_event, drag) =>
      setPan(drag.data + (axis === "x" ? drag.deltaX : -drag.deltaY) / 100),
  });
  return {
    ref,
    role: "slider",
    tabIndex: 0,
    "aria-label": `${label} pan`,
    "aria-valuemin": -1,
    "aria-valuemax": 1,
    "aria-valuenow": pan,
    "aria-valuetext": formatPan(pan),
    onDoubleClick: () => onPanChange(0),
    onKeyDown: (event: KeyboardEvent) => {
      const step = event.shiftKey ? 0.1 : 0.01;
      const next = {
        ArrowLeft: pan - step,
        ArrowDown: pan - step,
        ArrowRight: pan + step,
        ArrowUp: pan + step,
        Home: -1,
        End: 1,
      }[event.key];
      if (next !== undefined) {
        event.preventDefault();
        setPan(next);
      }
    },
  };
}
