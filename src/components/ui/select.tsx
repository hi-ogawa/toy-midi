import { ChevronDownIcon } from "lucide-react";
import * as React from "react";
import { cn } from "./utils";

export function Select({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <span className="relative inline-flex">
      <select
        className={cn(
          "h-8 appearance-none rounded border border-neutral-600 bg-neutral-900 py-0 pr-8 pl-3 text-sm text-neutral-100 outline-none transition-colors hover:border-neutral-500 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-neutral-400" />
    </span>
  );
}
