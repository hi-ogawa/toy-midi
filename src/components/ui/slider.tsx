import * as SliderPrimitive from "@radix-ui/react-slider";
import * as React from "react";
import { range } from "../../utils/array";
import { cn } from "./utils";

export function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  onValueChange,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max],
  );

  const handleSetValue = React.useEffectEvent((event: Event) => {
    onValueChange?.((event as CustomEvent<number[]>).detail);
  });

  // Lets E2E tests set exact values while exercising the real change handler.
  const setRootRef = React.useCallback(
    (root: HTMLSpanElement | null) => {
      if (!root) {
        return;
      }

      root.addEventListener("slider:set-value", handleSetValue);
      return () => root.removeEventListener("slider:set-value", handleSetValue);
    },
    [handleSetValue],
  );

  return (
    <SliderPrimitive.Root
      ref={setRootRef}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      onValueChange={onValueChange}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          "bg-neutral-700 relative grow overflow-hidden rounded-full data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2",
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className={cn(
            "bg-primary absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full",
          )}
        />
      </SliderPrimitive.Track>
      {range(_values.length).map((index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          className="block size-4 shrink-0 rounded-full border border-primary bg-white shadow-sm outline-none transition-[color,box-shadow] hover:ring-2 hover:ring-emerald-400/40 active:ring-3 active:ring-emerald-400/60 focus:ring-2 focus:ring-emerald-400/60 focus-visible:ring-4 focus-visible:ring-emerald-400 disabled:pointer-events-none disabled:opacity-50"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
        />
      ))}
    </SliderPrimitive.Root>
  );
}
