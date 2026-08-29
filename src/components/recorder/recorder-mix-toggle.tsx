import type { ComponentProps } from "react";
import { cn } from "../ui/utils";

export function RecorderMixToggle({
  active,
  kind,
  className,
  ...props
}: Omit<ComponentProps<"button">, "aria-pressed" | "type"> & {
  active: boolean;
  kind: "mute" | "solo";
}) {
  return (
    <button
      {...props}
      type="button"
      aria-pressed={active}
      className={cn(
        "border-neutral-600 text-neutral-300 hover:bg-neutral-700",
        active &&
          (kind === "mute"
            ? "border-amber-500/60 bg-amber-500/15 text-amber-300 hover:bg-amber-500/20"
            : "border-emerald-500/60 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20"),
        className,
      )}
    />
  );
}
