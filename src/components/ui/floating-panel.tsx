import { XIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "./utils";

type FloatingPanelProps = {
  title: ReactNode;
  headerActions?: ReactNode;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
  className?: string;
  contentClassName?: string;
  style?: CSSProperties;
};

export function FloatingPanel({
  title,
  headerActions,
  closeLabel,
  onClose,
  children,
  testId,
  className,
  contentClassName,
  style,
}: FloatingPanelProps) {
  return (
    <section
      data-testid={testId}
      style={style}
      className={cn(
        "fixed bottom-4 right-4 z-40 max-w-[calc(100vw-2rem)] rounded-lg border border-neutral-700 bg-neutral-800 shadow-2xl",
        className,
      )}
    >
      <div className="flex items-center gap-4 border-b border-neutral-700 px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
        <div className="ml-auto">{headerActions}</div>
        <button
          onClick={onClose}
          className="text-neutral-400 hover:text-neutral-200"
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
