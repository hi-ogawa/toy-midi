import { useEffect, useRef } from "react";
import {
  type LevelMeters,
  type MeterChannel,
  type MeterTarget,
  getMeterTargetKey,
} from "../lib/level-meters";
import { MAX_DB, MIN_DB, clamp } from "../lib/music";
import { cn } from "./ui/utils";

const WIDTH = 7;
const SILENT_READOUT = "-∞ dBFS";
const SCALE_TICKS = [6, 0, -6, -12, -18, -24, -36, -48, -60];
// Zones are by level, so a color means the same dB wherever the bar ends.
const ZONES = [
  { below: -12, body: "#047857", line: "#6ee7b7" }, // emerald-700, emerald-300
  { below: 0, body: "#b45309", line: "#fcd34d" }, // amber-700, amber-300
  { below: Infinity, body: "#b91c1c", line: "#fca5a5" }, // red-700, red-300
];

/**
 * Meter on the fader's dB scale, one bar per channel, with a latched clip
 * indicator. The readout shows the peak in dBFS.
 */
export function LevelMeter({
  meters,
  target,
  label,
  orientation = "vertical",
  channelCount = 2,
  readout = false,
}: {
  meters: LevelMeters;
  target: MeterTarget;
  label: string;
  orientation?: "vertical" | "horizontal";
  /** Shows only the first channel of the stereo levels when 1 */
  channelCount?: 1 | 2;
  readout?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLButtonElement>(null);
  const readoutRef = useRef<HTMLOutputElement>(null);
  const targetKey = getMeterTargetKey(target);

  useEffect(() => {
    const meterCanvas = new MeterCanvas(canvasRef.current!, orientation);
    const meter = meterRef.current!;
    const dots = [...clipRef.current!.children] as HTMLElement[];
    const readoutElement = readoutRef.current;
    const unsubscribe = meters.subscribe(target, (stereo) => {
      const channels = stereo.slice(0, channelCount);
      meterCanvas.draw(channels);
      channels.forEach((channel, index) => {
        dots[index]!.dataset.clipped = String(channel.clipped);
      });
      // Rounded so the DOM changes only when the reading does.
      const rms = Math.round(Math.max(...channels.map((c) => c.rms)));
      const valueNow = String(clamp(rms, MIN_DB, MAX_DB));
      if (meter.getAttribute("aria-valuenow") !== valueNow) {
        meter.setAttribute("aria-valuenow", valueNow);
      }
      if (readoutElement) {
        const peak = Math.max(...channels.map((c) => c.peak));
        const text = peak > MIN_DB ? `${peak.toFixed(1)} dBFS` : SILENT_READOUT;
        if (readoutElement.textContent !== text) {
          readoutElement.textContent = text;
        }
      }
    });
    return () => {
      meterCanvas.dispose();
      unsubscribe();
    };
    // Keyed by value, so a target object recreated on render keeps the subscription.
  }, [meters, targetKey, orientation, channelCount]);

  const vertical = orientation === "vertical";
  const meter = (
    <div
      ref={meterRef}
      role="meter"
      aria-label={`${label} level`}
      aria-valuemin={MIN_DB}
      aria-valuemax={MAX_DB}
      aria-valuenow={MIN_DB}
      className={cn("relative", vertical ? "shrink-0" : "mr-2 min-w-0 flex-1")}
      style={vertical ? { width: WIDTH } : { height: WIDTH }}
    >
      {/* Sits past the loud end of the bar, with padding to enlarge the target. */}
      <button
        ref={clipRef}
        type="button"
        tabIndex={-1}
        aria-label={`Clear ${label} clip`}
        title="Clipped. Click to clear."
        onClick={() => meters.clearClip(target)}
        className={cn(
          "absolute flex cursor-pointer items-center gap-px",
          vertical
            ? "-inset-x-1 -top-2 h-2 px-1"
            : "-inset-y-1 -right-2 w-2 flex-col py-1",
        )}
      >
        {Array.from({ length: channelCount }, (_, index) => (
          <span
            key={index}
            data-testid="meter-clip"
            className={cn(
              "flex-1 rounded-[1px] bg-neutral-700 data-[clipped=true]:bg-red-500",
              vertical ? "h-1" : "w-1",
            )}
          />
        ))}
      </button>
      <canvas ref={canvasRef} className="size-full" />
    </div>
  );
  if (!readout) {
    return meter;
  }
  return (
    <div className="flex items-center gap-1">
      {meter}
      <output
        ref={readoutRef}
        className="w-[76px] shrink-0 text-right font-mono text-xs tabular-nums text-neutral-400"
      >
        {SILENT_READOUT}
      </output>
    </div>
  );
}

/** dB labels on the meter's scale. */
export function MeterScale() {
  return (
    <div aria-hidden="true" className="relative w-4 shrink-0">
      {SCALE_TICKS.map((db) => (
        <div
          key={db}
          className="absolute inset-x-0 -translate-y-1/2 text-center font-mono text-[9px] leading-none text-neutral-500"
          style={{ top: `${getMeterPosition(db) * 100}%` }}
        >
          {/* Labels drop the minus sign to save width, so every label except 6 and 0 is negative. */}
          {Math.abs(db)}
        </div>
      ))}
    </div>
  );
}

/** Position from the top of the scale, from 0 at MAX_DB to 1 at MIN_DB. */
function getMeterPosition(db: number): number {
  return 1 - (clamp(db, MIN_DB, MAX_DB) - MIN_DB) / (MAX_DB - MIN_DB);
}

/**
 * Draws meter channels side by side on a canvas that tracks its element's
 * size. Drawing happens in meter coordinates, across the bars and along the
 * scale from MAX_DB, and the canvas transform maps them to either orientation.
 */
class MeterCanvas {
  private readonly context: CanvasRenderingContext2D;
  private readonly observer: ResizeObserver;
  private thickness = 0;
  private length = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly orientation: "vertical" | "horizontal",
  ) {
    this.context = canvas.getContext("2d")!;
    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
  }

  draw(channels: readonly MeterChannel[]): void {
    const { context, thickness, length } = this;
    const barThickness = (thickness - (channels.length - 1)) / channels.length;
    const getMeterY = (db: number) => getMeterPosition(db) * length;
    context.clearRect(0, 0, thickness, length);
    channels.forEach((channel, index) => {
      const x = index * (barThickness + 1);
      // A dark well, so a silent meter still stands out from its background.
      context.fillStyle = "#0a0a0a"; // neutral-950
      context.fillRect(x, 0, barThickness, length);

      // A faint fill between the RMS body and the peak shows the crest factor.
      if (channel.peak > channel.rms && channel.peak > MIN_DB) {
        context.globalAlpha = 0.18;
        context.fillStyle = getZone(channel.peak).line;
        const top = getMeterY(channel.peak);
        context.fillRect(x, top, barThickness, getMeterY(channel.rms) - top);
        context.globalAlpha = 1;
      }

      let zoneBottom = length;
      for (const zone of ZONES) {
        const top = getMeterY(Math.min(channel.rms, zone.below));
        if (top < zoneBottom) {
          context.fillStyle = zone.body;
          context.fillRect(x, top, barThickness, zoneBottom - top);
        }
        zoneBottom = getMeterY(zone.below);
        if (channel.rms <= zone.below) {
          break;
        }
      }

      if (channel.peak > MIN_DB) {
        context.fillStyle = getZone(channel.peak).line;
        context.fillRect(
          x,
          Math.min(length - 1, Math.round(getMeterY(channel.peak))),
          barThickness,
          1,
        );
      }

      if (channel.hold > MIN_DB) {
        context.fillStyle = "#e5e5e5"; // neutral-200
        context.fillRect(
          x,
          clamp(Math.round(getMeterY(channel.hold)) - 1, 0, length - 2),
          barThickness,
          2,
        );
      }
    });
  }

  dispose(): void {
    this.observer.disconnect();
  }

  // Resizing the canvas clears it and resets its transform, and the next frame
  // redraws at the new size.
  private resize(): void {
    const { canvas, context } = this;
    const pixelRatio = window.devicePixelRatio;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    if (this.orientation === "vertical") {
      this.thickness = width;
      this.length = height;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    } else {
      // MAX_DB sits at the right edge, and bars stack downward.
      this.thickness = height;
      this.length = width;
      context.setTransform(
        0,
        pixelRatio,
        -pixelRatio,
        0,
        width * pixelRatio,
        0,
      );
    }
  }
}

function getZone(db: number) {
  return ZONES.find((zone) => db <= zone.below)!;
}
