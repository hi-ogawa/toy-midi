import { XIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "../ui/utils";

export function RecorderPanel({
  title,
  closeLabel,
  onClose,
  children,
  testId,
  className,
  contentClassName,
  style,
}: {
  title: ReactNode;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
  className?: string;
  contentClassName?: string;
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
      <div className="flex items-center gap-4 border-b border-neutral-700 px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
        <button
          onClick={onClose}
          className="ml-auto text-neutral-400 hover:text-neutral-200"
          aria-label={closeLabel}
        >
          <XIcon className="size-5" />
        </button>
      </div>
      <div className={contentClassName ?? "overflow-x-auto px-4 py-3"}>
        {children}
      </div>
    </section>
  );
}
