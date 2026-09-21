import { XIcon } from "lucide-react";
import { useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./utils";

type DialogProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  "data-testid"?: string;
  size?: "default" | "wide";
};

export function PortalDialog(props: DialogProps) {
  // TODO: Move focus into the dialog, trap it, and restore it on close.
  // Keyboard isolation currently only works while focus is inside the portal.
  if (!props.isOpen) {
    return;
  }
  return createPortal(
    <div
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          props.onClose();
        }
      }}
    >
      <Dialog {...props} />
    </div>,
    document.body,
  );
}

export function Dialog({
  isOpen,
  onClose,
  title,
  children,
  "data-testid": testId,
  size = "default",
}: DialogProps) {
  const titleId = useId();
  if (!isOpen) {
    return null;
  }

  return (
    <div
      data-testid={testId}
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby={titleId}
        className={cn(
          "bg-neutral-800 rounded-lg shadow-2xl w-full",
          size === "wide" ? "max-w-[960px]" : "max-w-md",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-neutral-700 px-6 py-4 flex justify-between items-center">
          <h2 id={titleId} className="text-lg font-semibold text-neutral-100">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-200"
            aria-label="Close"
          >
            <XIcon className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
