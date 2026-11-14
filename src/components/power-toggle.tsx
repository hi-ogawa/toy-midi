import { PowerIcon } from "lucide-react";
import type { ComponentProps } from "react";

export function PowerToggle({
  on,
  ...props
}: Omit<ComponentProps<"button">, "aria-pressed" | "children"> & {
  on: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      aria-pressed={on}
      className="flex size-control-xs shrink-0 items-center justify-center rounded text-neutral-500 outline-none hover:text-neutral-300 focus-visible:ring-2 focus-visible:ring-blue-300 aria-pressed:text-blue-400 aria-pressed:hover:text-blue-300"
    >
      <PowerIcon className="size-3.5" aria-hidden="true" />
    </button>
  );
}
