import { type ReactNode } from "react";
import { Button } from "./button";

type DialogProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
};

export function Dialog({
  isOpen,
  onClose,
  title,
  children,
  footer,
  testId,
}: DialogProps) {
  if (!isOpen) return null;

  return (
    <div
      data-testid={testId}
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-neutral-800 rounded-lg shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-neutral-700 px-6 py-4 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-neutral-100">{title}</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-200 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="border-t border-neutral-700 px-6 py-4 flex justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// Convenience wrapper for simple close-only footer
type SimpleDialogProps = Omit<DialogProps, "footer"> & {
  closeLabel?: string;
};

export function SimpleDialog({
  closeLabel = "Close",
  ...props
}: SimpleDialogProps) {
  return (
    <Dialog
      {...props}
      footer={<Button onClick={props.onClose}>{closeLabel}</Button>}
    />
  );
}
