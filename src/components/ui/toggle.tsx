import * as React from "react";
import { cn } from "./utils";

type ToggleProps = Omit<
  React.ComponentProps<"button">,
  "aria-pressed" | "onChange" | "type" | "value"
> & {
  value: boolean;
  variant?: "neutral" | "primary";
  onChange: (value: boolean) => void;
};

export function Toggle({
  className,
  onChange,
  onClick,
  value,
  variant = "neutral",
  ...props
}: ToggleProps) {
  return (
    <button
      aria-pressed={value}
      type="button"
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-input bg-transparent text-foreground shadow-xs transition-[color,box-shadow] hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none disabled:pointer-events-none disabled:opacity-50",
        variant === "neutral"
          ? "aria-pressed:bg-foreground aria-pressed:text-background aria-pressed:hover:bg-foreground/80 aria-pressed:hover:text-background"
          : "aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/80 aria-pressed:hover:text-primary-foreground",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          onChange(!value);
        }
      }}
      {...props}
    />
  );
}
