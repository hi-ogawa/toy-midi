import { gainToDb, MAX_DB, MIN_DB } from "../lib/music";
import { cn } from "./ui/utils";

export function InputMeter({
  active,
  className,
  levelClassName,
  meterClassName,
  outputClassName,
  overloadClassName,
  overloadRegionClassName,
  peak,
  zeroMarkerClassName,
}: {
  active: boolean;
  className?: string;
  levelClassName?: string;
  meterClassName?: string;
  outputClassName?: string;
  overloadClassName?: string;
  overloadRegionClassName?: string;
  peak: number;
  zeroMarkerClassName?: string;
}) {
  const getPosition = (value: number) =>
    ((value - MIN_DB) / (MAX_DB - MIN_DB)) * 100;
  const zeroPosition = getPosition(0);
  const decibels = gainToDb(peak);
  const meterValue = Math.max(MIN_DB, Math.min(MAX_DB, decibels));
  const levelPosition = active ? getPosition(meterValue) : 0;
  const label = active ? `${decibels.toFixed(1)} dBFS` : "-∞ dBFS";

  return (
    <div
      className={cn("grid grid-cols-[1fr_76px] items-center gap-3", className)}
    >
      <div
        role="meter"
        aria-label="Input peak level"
        aria-valuemin={MIN_DB}
        aria-valuemax={MAX_DB}
        aria-valuenow={active ? meterValue : MIN_DB}
        aria-valuetext={label}
        className={cn(
          "relative h-3 overflow-hidden rounded-full bg-neutral-200",
          meterClassName,
        )}
      >
        <div
          className={cn(
            "absolute inset-y-0 right-0 bg-red-100",
            overloadRegionClassName,
          )}
          style={{ width: `${100 - zeroPosition}%` }}
        />
        <div
          className={cn(
            "absolute inset-y-0 left-0 bg-emerald-600 transition-[width] duration-75",
            levelClassName,
          )}
          style={{ width: `${Math.min(levelPosition, zeroPosition)}%` }}
        />
        <div
          className={cn(
            "absolute inset-y-0 bg-red-600 transition-[width] duration-75",
            overloadClassName,
          )}
          style={{
            left: `${zeroPosition}%`,
            width: `${Math.max(0, levelPosition - zeroPosition)}%`,
          }}
        />
        {zeroMarkerClassName && (
          <div
            aria-hidden="true"
            className={cn("absolute inset-y-0 w-px", zeroMarkerClassName)}
            style={{ left: `${zeroPosition}%` }}
          />
        )}
      </div>
      <output
        className={cn(
          "text-right font-mono text-xs tabular-nums text-neutral-600",
          outputClassName,
        )}
      >
        {label}
      </output>
    </div>
  );
}
