import { useEffect, useRef } from "react";
import type { LevelMeters } from "../lib/level-meters";
import { MAX_DB, MIN_DB, clamp } from "../lib/music";
import { MeterCanvas } from "./level-meter";

const SILENT_LABEL = "-∞ dBFS";

/**
 * Mono input meter that reads peak first, since setting a recording level is
 * about headroom.
 */
export function InputMeter({
  meters,
  compact = false,
}: {
  meters: LevelMeters;
  compact?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLButtonElement>(null);
  const readoutRef = useRef<HTMLOutputElement>(null);

  useEffect(() => {
    const meterCanvas = new MeterCanvas(canvasRef.current!, "horizontal");
    const meter = meterRef.current!;
    const clip = clipRef.current!;
    const readout = readoutRef.current;
    let label: string | undefined;
    const unsubscribe = meters.subscribe({ kind: "input" }, (channels) => {
      meterCanvas.draw(channels);
      const { peak, clipped } = channels[0]!;
      clip.dataset.clipped = String(clipped);
      const nextLabel =
        peak > MIN_DB ? `${peak.toFixed(1)} dBFS` : SILENT_LABEL;
      // Compared by label so the DOM changes only when the reading does.
      if (nextLabel !== label) {
        label = nextLabel;
        meter.setAttribute(
          "aria-valuenow",
          String(clamp(Math.round(peak), MIN_DB, MAX_DB)),
        );
        meter.setAttribute("aria-valuetext", label);
        if (readout) {
          readout.textContent = label;
        }
      }
    });
    return () => {
      meterCanvas.dispose();
      unsubscribe();
    };
  }, [meters]);

  return (
    <div className="flex items-center gap-1">
      <div
        ref={meterRef}
        role="meter"
        aria-label="Input peak level"
        aria-valuemin={MIN_DB}
        aria-valuemax={MAX_DB}
        aria-valuenow={MIN_DB}
        aria-valuetext={SILENT_LABEL}
        className="h-3 min-w-0 flex-1 overflow-hidden rounded-sm ring-1 ring-neutral-700"
      >
        <canvas ref={canvasRef} className="size-full" />
      </div>
      <button
        ref={clipRef}
        type="button"
        tabIndex={-1}
        aria-label="Clear input clip"
        title="Clipped. Click to clear."
        onClick={() => meters.clearClip({ kind: "input" })}
        data-testid="meter-clip"
        className="h-3 w-1 shrink-0 cursor-pointer rounded-[1px] bg-neutral-700 data-[clipped=true]:bg-red-500"
      />
      {!compact && (
        <output
          ref={readoutRef}
          className="w-[76px] shrink-0 text-right font-mono text-xs tabular-nums text-neutral-400"
        >
          {SILENT_LABEL}
        </output>
      )}
    </div>
  );
}
