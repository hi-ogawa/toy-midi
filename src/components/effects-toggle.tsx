import { cn } from "./ui/utils";

/** Highlights while the panel is open, and colors while the effects are on. */
export function EffectsToggle({
  label,
  open,
  active,
  onClick,
  className,
}: {
  label: string;
  open: boolean;
  active: boolean;
  onClick: () => void;
  className: string;
}) {
  return (
    <button
      type="button"
      aria-label={`${label} effects`}
      aria-pressed={open}
      title={`${open ? "Close" : "Open"} ${label} effects${active ? " (EQ on)" : ""}`}
      data-active={active}
      onClick={onClick}
      className={cn(
        "shrink-0 rounded border border-neutral-600 text-xs font-semibold hover:bg-neutral-700 aria-pressed:bg-neutral-700 data-[active=true]:border-blue-400 data-[active=true]:text-blue-300 focus-visible:outline-2 focus-visible:outline-blue-300",
        className,
      )}
    >
      FX
    </button>
  );
}
