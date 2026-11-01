import type { ComponentProps } from "react";
import { cn } from "./utils";

const SWEEP_DEGREES = 270;

// Pan has its own color wherever it appears, so a pan knob reads apart from
// level and other knobs beside it.
const ARC_CLASSES = {
  primary: "stroke-primary",
  pan: "stroke-sky-300",
};

/** A focusable slider drawn as a knob. The caller supplies the label and the input behavior through div props. */
export function Knob({
  value,
  min,
  max,
  origin = min,
  color = "primary",
  className,
  ...props
}: ComponentProps<"div"> & {
  value: number;
  min: number;
  max: number;
  /** Where the value arc starts, such as the center of a pan knob */
  origin?: number;
  color?: keyof typeof ARC_CLASSES;
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
      role="slider"
      tabIndex={0}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
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
            className={ARC_CLASSES[color]}
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
