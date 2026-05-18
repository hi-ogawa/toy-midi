import * as React from "react";
import { cn } from "../../lib/utils";

type ToggleProps = Omit<
  React.ComponentProps<"button">,
  "aria-pressed" | "onChange" | "type" | "value"
> & {
  value: boolean;
  onChange: (value: boolean) => void;
};

export function Toggle({
  className,
  onChange,
  onClick,
  value,
  ...props
}: ToggleProps) {
  return (
    <button
      aria-pressed={value}
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none disabled:pointer-events-none disabled:opacity-50",
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
