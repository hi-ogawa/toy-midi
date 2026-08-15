import { XIcon } from "lucide-react";
import type { ReactNode } from "react";

type FloatingPanelProps = {
  title: ReactNode;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
};

export function FloatingPanel({
  title,
  closeLabel,
  onClose,
  children,
  testId,
}: FloatingPanelProps) {
  return (
    <section
      data-testid={testId}
      className="fixed bottom-4 right-4 z-40 max-w-[calc(100vw-2rem)] rounded-lg border border-neutral-700 bg-neutral-800 shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
        <button
          onClick={onClose}
          className="text-neutral-400 hover:text-neutral-200"
          aria-label={closeLabel}
        >
          <XIcon className="size-5" />
        </button>
      </div>
      <div className="overflow-x-auto px-4 py-3">{children}</div>
    </section>
  );
}
