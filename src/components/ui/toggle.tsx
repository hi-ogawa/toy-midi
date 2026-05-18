import * as React from "react";

import { cn } from "../../lib/utils";

type ToggleProps = Omit<
  React.ComponentProps<"button">,
  "aria-pressed" | "type"
> & {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
};

export function Toggle({
  className,
  onClick,
  onPressedChange,
  pressed,
  ...props
}: ToggleProps) {
  return (
    <button
      aria-pressed={pressed}
      data-slot="toggle"
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-transparent text-sm font-medium shadow-xs transition-[color,box-shadow] hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          onPressedChange(!pressed);
        }
      }}
      {...props}
    />
  );
}
