import { useEffect, useRef } from "react";
import type {
  LevelMeters,
  MeterChannel,
  MeterTarget,
} from "../lib/level-meters";
import { MAX_DB, MIN_DB, clamp } from "../lib/music";

const BAR_WIDTH = 3;
const WIDTH = BAR_WIDTH * 2 + 1;
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
    const canvas = canvasRef.current!;
    const meter = meterRef.current!;
    const dots = [...clipRef.current!.children] as HTMLElement[];
    const context = canvas.getContext("2d")!;
    const pixelRatio = window.devicePixelRatio;
    let height = 0;
    // Resizing the canvas clears it and resets its transform, and the next
    // frame redraws at the new height.
    const resize = () => {
      height = canvas.clientHeight;
      canvas.width = WIDTH * pixelRatio;
      canvas.height = height * pixelRatio;
      context.scale(pixelRatio, pixelRatio);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    let valueNow: number | undefined;
    const unsubscribe = meters.subscribe(
      getMeterTarget(trackId),
      (channels) => {
        drawMeter(context, channels, height);
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
      observer.disconnect();
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

// Quieter than this reads as silence, such as a reverb tail fading out.
const ACTIVITY_THRESHOLD_DB = -48;

/** Dot that lights while a track is sounding and dims with its level. */
export function ActivityLed({
  meters,
  trackId,
}: {
  meters: LevelMeters;
  trackId: string;
}) {
  const ledRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const led = ledRef.current!;
    return meters.subscribe(getMeterTarget(trackId), (channels) => {
      const peak = Math.max(...channels.map((c) => c.peak));
      const rms = Math.max(...channels.map((c) => c.rms));
      const active = peak > ACTIVITY_THRESHOLD_DB;
      const level = 1 - getMeterPosition(rms);
      led.dataset.active = String(active);
      led.style.opacity = active ? String(0.45 + 0.55 * level) : "";
      led.style.boxShadow = active
        ? `0 0 ${2 + 4 * level}px var(--color-emerald-400)`
        : "";
    });
  }, [meters, trackId]);

  return (
    <span
      ref={ledRef}
      data-testid="track-activity"
      aria-hidden="true"
      className="size-2 shrink-0 rounded-full bg-neutral-700 data-[active=true]:bg-emerald-400"
    />
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

function drawMeter(
  context: CanvasRenderingContext2D,
  channels: readonly [MeterChannel, MeterChannel],
  height: number,
) {
  const getMeterY = (db: number) => getMeterPosition(db) * height;
  context.clearRect(0, 0, WIDTH, height);
  channels.forEach((channel, index) => {
    const x = index * (BAR_WIDTH + 1);
    // A dark well, so a silent meter still stands out from the strip background.
    context.fillStyle = "#0a0a0a"; // neutral-950
    context.fillRect(x, 0, BAR_WIDTH, height);

    // A faint fill between the RMS body and the peak shows the crest factor.
    if (channel.peak > channel.rms && channel.peak > MIN_DB) {
      context.globalAlpha = 0.18;
      context.fillStyle = getZone(channel.peak).line;
      const top = getMeterY(channel.peak);
      context.fillRect(x, top, BAR_WIDTH, getMeterY(channel.rms) - top);
      context.globalAlpha = 1;
    }

    let zoneBottom = height;
    for (const zone of ZONES) {
      const top = getMeterY(Math.min(channel.rms, zone.below));
      if (top < zoneBottom) {
        context.fillStyle = zone.body;
        context.fillRect(x, top, BAR_WIDTH, zoneBottom - top);
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
        Math.min(height - 1, Math.round(getMeterY(channel.peak))),
        BAR_WIDTH,
        1,
      );
    }

    if (channel.hold > MIN_DB) {
      context.fillStyle = "#e5e5e5"; // neutral-200
      context.fillRect(
        x,
        clamp(Math.round(getMeterY(channel.hold)) - 1, 0, height - 2),
        BAR_WIDTH,
        2,
      );
    }
  });
}

function getZone(db: number) {
  return ZONES.find((zone) => db <= zone.below)!;
}
