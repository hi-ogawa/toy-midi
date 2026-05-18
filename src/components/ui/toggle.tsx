"use client";

import * as TogglePrimitive from "@radix-ui/react-toggle";
import * as React from "react";

import { cn } from "../../lib/utils";

type ToggleProps = React.ComponentProps<typeof TogglePrimitive.Root>;

function Toggle({ className, ...props }: ToggleProps) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md border border-input bg-transparent text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none transition-[color,box-shadow] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive whitespace-nowrap",
        className,
      )}
      {...props}
    />
  );
}

export { Toggle };
