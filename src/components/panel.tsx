import { XIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "./ui/utils";

export function Panel({
  title,
  headerActions,
  closeLabel,
  onClose,
  children,
  "data-testid": testId,
  className,
  contentClassName,
  flush,
  style,
}: {
  title: ReactNode;
  headerActions?: ReactNode;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  "data-testid"?: string;
  className?: string;
  contentClassName?: string;
  /** Lets the content reach the panel's edges, without body padding. */
  flush?: boolean;
  style?: CSSProperties;
}) {
  return (
    <section
      data-testid={testId}
      style={style}
      className={cn(
        "rounded-lg border border-neutral-700 bg-neutral-800 shadow-2xl",
        className,
      )}
    >
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-neutral-700 px-3">
        <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
        <div className="ml-auto flex items-center gap-3">
          {headerActions}
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-200"
            aria-label={closeLabel}
          >
            <XIcon className="size-5" />
          </button>
        </div>
      </div>
      <div
        className={cn(
          !flush && "px-3 py-2",
          contentClassName ?? "overflow-x-auto",
        )}
      >
        {children}
      </div>
    </section>
  );
}
