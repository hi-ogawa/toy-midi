import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";
import { useRef, type ComponentProps, type ReactNode } from "react";
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
  const previousFocus = useRef<HTMLElement | undefined>(undefined);

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        title={title}
        size={size}
        data-testid={testId}
        onOpenAutoFocus={() => {
          previousFocus.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : undefined;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          previousFocus.current?.focus();
        }}
      >
        {children}
      </DialogContent>
    </DialogPrimitive.Root>
  );
}

export const DialogRoot = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

export function DialogContent({
  title,
  children,
  size = "default",
  "data-testid": testId,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  title: string;
  size?: "default" | "wide";
  "data-testid"?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 bg-black/70 z-50" />
      <DialogPrimitive.Content
        data-testid={testId}
        aria-describedby={undefined}
        className={cn(
          "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-neutral-800 rounded-lg shadow-2xl w-[calc(100%-2rem)]",
          size === "wide" ? "max-w-[960px]" : "max-w-md",
        )}
        {...props}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (matchKeyboardEvent(event, "Ctrl+S")) {
            event.preventDefault();
          }
        }}
      >
        <div className="border-b border-neutral-700 px-6 py-4 flex justify-between items-center">
          <DialogPrimitive.Title className="text-lg font-semibold text-neutral-100">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close asChild>
            <button
              className="text-neutral-400 hover:text-neutral-200"
              aria-label="Close"
            >
              <XIcon className="size-5" />
            </button>
          </DialogPrimitive.Close>
        </div>
        <div className="p-6">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
