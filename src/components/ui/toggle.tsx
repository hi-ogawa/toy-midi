"use client";

import * as React from "react";

import { cn } from "../../lib/utils";

type ToggleProps = Omit<
  React.ComponentProps<"button">,
  "aria-pressed" | "type"
> & {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
};

function Toggle({
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
        "inline-flex items-center justify-center gap-2 rounded-md border border-input bg-transparent text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-[pressed=true]:bg-accent aria-[pressed=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none transition-[color,box-shadow] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive whitespace-nowrap",
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

export { Toggle };
