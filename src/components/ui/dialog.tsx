import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { matchKeyboardEvent } from "../../lib/keyboard";
import { cn } from "./utils";

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
  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-black/70 z-50" />
        <DialogPrimitive.Content
          data-testid={testId}
          aria-describedby={undefined}
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-neutral-800 rounded-lg shadow-2xl w-[calc(100%-2rem)]",
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
          <div className="flex h-panel-header items-center justify-between border-b border-neutral-700 pr-1 pl-3">
            <DialogPrimitive.Title className="text-sm font-semibold text-neutral-100">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <button
                className="flex size-control-sm items-center justify-center rounded text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
                aria-label="Close"
              >
                <XIcon className="size-4" />
              </button>
            </DialogPrimitive.Close>
          </div>
          <div className="p-3">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
