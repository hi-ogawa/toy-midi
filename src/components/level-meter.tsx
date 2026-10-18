import { useEffect, useRef } from "react";
import type {
  LevelMeters,
  MeterChannel,
  MeterTarget,
} from "../lib/level-meters";
import { MAX_DB, MIN_DB, clamp } from "../lib/music";

const WIDTH = 7;
const SCALE_TICKS = [6, 0, -6, -12, -18, -24, -36, -48, -60];
// Zones are by level, so a color means the same dB wherever the bar ends.
const ZONES = [
  { below: -12, body: "#047857", line: "#6ee7b7" }, // emerald-700, emerald-300
  { below: 0, body: "#b45309", line: "#fcd34d" }, // amber-700, amber-300
  { below: Infinity, body: "#b91c1c", line: "#fca5a5" }, // red-700, red-300
];

/** Stereo meter on the fader's dB scale, with a latched clip indicator. */
export function LevelMeter({
  meters,
  trackId,
  label,
}: {
  meters: LevelMeters;
  /** Meters the master output when omitted */
  trackId?: string;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const meterCanvas = new MeterCanvas(canvasRef.current!, "vertical");
    const meter = meterRef.current!;
    const dots = [...clipRef.current!.children] as HTMLElement[];
    let valueNow: number | undefined;
    const unsubscribe = meters.subscribe(
      getMeterTarget(trackId),
      (channels) => {
        meterCanvas.draw(channels);
        channels.forEach((channel, index) => {
          dots[index]!.dataset.clipped = String(channel.clipped);
        });
        // Rounded so the attribute changes only when the reading does.
        const rms = Math.round(Math.max(...channels.map((c) => c.rms)));
        if (rms !== valueNow) {
          valueNow = rms;
          meter.setAttribute(
            "aria-valuenow",
            String(clamp(rms, MIN_DB, MAX_DB)),
          );
        }
      },
    );
    return () => {
      meterCanvas.dispose();
      unsubscribe();
    };
  }, [meters, trackId]);

  return (
    <div
      ref={meterRef}
      role="meter"
      aria-label={`${label} level`}
      aria-valuemin={MIN_DB}
      aria-valuemax={MAX_DB}
      aria-valuenow={MIN_DB}
      className="relative shrink-0"
      style={{ width: WIDTH }}
    >
      <button
        ref={clipRef}
        type="button"
        tabIndex={-1}
        aria-label={`Clear ${label} clip`}
        title="Clipped. Click to clear."
        onClick={() => meters.clearClip(getMeterTarget(trackId))}
        className="absolute -top-2 -left-1 flex h-2 cursor-pointer items-center gap-px px-1"
      >
        {[0, 1].map((index) => (
          <span
            key={index}
            data-testid="meter-clip"
            className="h-1 w-[3px] rounded-[1px] bg-neutral-700 data-[clipped=true]:bg-red-500"
          />
        ))}
      </button>
      <canvas ref={canvasRef} className="size-full" />
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

function getMeterTarget(trackId: string | undefined): MeterTarget {
  return trackId === undefined
    ? { kind: "master" }
    : { kind: "track", id: trackId };
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
