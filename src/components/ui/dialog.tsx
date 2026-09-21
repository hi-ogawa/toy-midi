import { XIcon } from "lucide-react";
import {
  createContext,
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { matchKeyboardEvent } from "../../lib/keyboard";
import { cn } from "./utils";

// Nested popups must stay inside the native modal to remain interactive in its top layer.
export const DialogPortalContext = createContext<
  RefObject<HTMLDialogElement | null> | undefined
>(undefined);

type DialogProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  "data-testid"?: string;
  size?: "default" | "wide";
};

export function Dialog({
  isOpen,
  onClose,
  title,
  children,
  "data-testid": testId,
  size = "default",
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current!;
    if (isOpen) {
      // The browser remembers the focused opener and restores it when closed.
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      data-testid={testId}
      aria-labelledby={titleId}
      closedby="any"
      onClose={() => {
        if (!dialogRef.current?.open) {
          onClose();
        }
      }}
      className={cn(
        "fixed inset-0 m-auto overflow-visible max-h-[calc(100%-2rem)] rounded-lg border-0 bg-neutral-800 p-0 text-inherit shadow-2xl w-[calc(100%-2rem)] backdrop:bg-black/70",
        size === "wide" ? "max-w-[960px]" : "max-w-md",
      )}
      onKeyDown={(event) => {
        // Keep dialog keystrokes from reaching the editor’s global shortcuts.
        event.stopPropagation();
        // Also suppress Save Page because the editor’s save handler cannot run here.
        if (matchKeyboardEvent(event, "Ctrl+S")) {
          event.preventDefault();
        }
      }}
    >
      {isOpen && (
        <DialogPortalContext value={dialogRef}>
          <div className="border-b border-neutral-700 px-6 py-4 flex justify-between items-center">
            <h2 id={titleId} className="text-lg font-semibold text-neutral-100">
              {title}
            </h2>
            <button
              autoFocus
              onClick={() => dialogRef.current?.close()}
              className="text-neutral-400 hover:text-neutral-200"
              aria-label="Close"
            >
              <XIcon className="size-5" />
            </button>
          </div>
          <div className="p-6">{children}</div>
        </DialogPortalContext>
      )}
    </dialog>
  );
}
