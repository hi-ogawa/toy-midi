import type { ComponentProps } from "react";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";

export function RecorderMixToggle({
  active,
  kind,
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, "aria-pressed"> & {
  active: boolean;
  kind: "mute" | "solo";
}) {
  return (
    <Button
      {...props}
      aria-pressed={active}
      className={cn(
        "border-neutral-600 text-neutral-300 hover:bg-neutral-700",
        active &&
          (kind === "mute"
            ? "border-amber-500/60 bg-amber-500/35 text-amber-300 hover:!bg-amber-500/40 hover:!text-amber-300"
            : "border-emerald-500/60 bg-emerald-500/35 text-emerald-300 hover:!bg-emerald-500/40 hover:!text-emerald-300"),
        className,
      )}
    />
  );
}
