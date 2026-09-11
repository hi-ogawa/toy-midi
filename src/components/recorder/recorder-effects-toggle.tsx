import { cn } from "../ui/utils";

export function RecorderEffectsToggle({
  label,
  open,
  onClick,
  className,
}: {
  label: string;
  open: boolean;
  onClick: () => void;
  className: string;
}) {
  return (
    <button
      type="button"
      aria-label={`${label} effects`}
      aria-pressed={open}
      title={`${open ? "Close" : "Open"} ${label} effects`}
      onClick={onClick}
      className={cn(
        "shrink-0 rounded border border-neutral-600 text-xs font-semibold hover:bg-neutral-700 aria-pressed:border-blue-400 aria-pressed:text-blue-300 focus-visible:outline-2 focus-visible:outline-blue-300",
        className,
      )}
    >
      FX
    </button>
  );
}
