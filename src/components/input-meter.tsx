import { gainToDb, MAX_DB, MIN_DB } from "../lib/music";
import { cn } from "./ui/utils";

export function InputMeter({
  active,
  peak,
  variant = "default",
}: {
  active: boolean;
  peak: number;
  variant?: "compact" | "default";
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
      className={cn(
        "grid items-center",
        variant === "compact"
          ? "grid-cols-[1fr_4.5rem] gap-2"
          : "grid-cols-[1fr_76px] gap-3",
      )}
    >
      <div
        role="meter"
        aria-label="Input peak level"
        aria-valuemin={MIN_DB}
        aria-valuemax={MAX_DB}
        aria-valuenow={active ? meterValue : MIN_DB}
        aria-valuetext={label}
        className={cn(
          "relative overflow-hidden",
          variant === "compact"
            ? "h-2 bg-neutral-700"
            : "h-3 rounded-full bg-neutral-200",
        )}
      >
        <div
          className={cn(
            "absolute inset-y-0 right-0",
            variant === "compact" ? "bg-red-950" : "bg-red-100",
          )}
          style={{ width: `${100 - zeroPosition}%` }}
        />
        <div
          className={cn(
            "absolute inset-y-0 left-0 transition-[width] duration-75",
            variant === "compact" ? "bg-emerald-500" : "bg-emerald-600",
          )}
          style={{ width: `${Math.min(levelPosition, zeroPosition)}%` }}
        />
        <div
          className={cn(
            "absolute inset-y-0 transition-[width] duration-75",
            variant === "compact" ? "bg-red-500" : "bg-red-600",
          )}
          style={{
            left: `${zeroPosition}%`,
            width: `${Math.max(0, levelPosition - zeroPosition)}%`,
          }}
        />
        {variant === "default" && (
          <div
            aria-hidden="true"
            className="absolute inset-y-0 w-px bg-red-700"
            style={{ left: `${zeroPosition}%` }}
          />
        )}
      </div>
      <output
        className={cn(
          "text-right font-mono tabular-nums",
          variant === "compact"
            ? "text-[10px] text-neutral-400"
            : "text-xs text-neutral-600",
        )}
      >
        {label}
      </output>
    </div>
  );
}
