import * as React from "react";
import { cn } from "./utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-8 rounded border border-neutral-600 bg-neutral-900 px-2 text-sm text-neutral-100 outline-none transition-colors placeholder:text-muted-foreground hover:border-neutral-500 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
