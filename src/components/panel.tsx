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
  style,
}: {
  title: ReactNode;
  headerActions?: ReactNode;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  "data-testid"?: string;
  className?: string;
  contentClassName: string;
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
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-neutral-700 pr-1 pl-3">
        <h2 className="min-w-0 text-sm font-semibold text-neutral-100">
          {title}
        </h2>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {headerActions}
          <button
            onClick={onClose}
            className="flex size-control-sm items-center justify-center rounded text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
            aria-label={closeLabel}
          >
            <XIcon className="size-4" />
          </button>
        </div>
      </div>
      <div className={contentClassName}>{children}</div>
    </section>
  );
}
