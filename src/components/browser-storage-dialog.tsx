import { useRef, useState } from "react";
import { useBrowserStorage } from "../hooks/use-browser-storage";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { cn } from "./ui/utils";

export function BrowserStorageDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        onClick={() => setIsOpen(true)}
        className="mr-2 self-center text-xs text-neutral-400 underline decoration-neutral-600 underline-offset-4 hover:text-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400"
      >
        Manage storage
      </button>
      <Dialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
        title="Browser storage"
      >
        <BrowserStorageDetails />
      </Dialog>
    </>
  );
}

function BrowserStorageDetails() {
  const { persistence, estimate, protect } = useBrowserStorage();
  const persisted = persistence.data?.persisted;
  const usage = estimate.data?.estimate?.usage;
  const formattedUsage =
    usage === undefined ? undefined : formatStorageBytes(usage);
  const protectionStatus = persistence.isError
    ? "Unavailable"
    : persistence.isPending
      ? "Checking…"
      : persisted === undefined
        ? "Unavailable"
        : persisted
          ? "On"
          : "Off";

  return (
    <div className="text-xs">
      <p className="text-neutral-400">Used by this site</p>
      {estimate.isError ? (
        <p className="mt-2 text-neutral-400">
          Could not estimate storage usage
        </p>
      ) : estimate.isPending ? (
        <p className="mt-2 text-neutral-400">Checking storage usage…</p>
      ) : formattedUsage ? (
        <p className="my-2 text-3xl font-medium tracking-tight text-neutral-100">
          {formattedUsage.amount}{" "}
          <span className="text-base font-normal tracking-normal text-neutral-400">
            {formattedUsage.unit}
          </span>
        </p>
      ) : (
        <p className="mt-2 text-neutral-400">Storage estimate unavailable</p>
      )}
      <p className="mt-2 text-neutral-500">
        Estimated total, including any legacy project data.
      </p>
      <div className="my-6 border-t border-neutral-700" />
      <div className="flex items-center justify-between gap-4" role="status">
        <span className="font-medium text-neutral-200">
          Automatic cleanup protection
        </span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px]",
            protectionStatus === "On"
              ? "border-emerald-800 bg-emerald-950/40 text-emerald-300"
              : "border-neutral-600 text-neutral-400",
          )}
        >
          {protectionStatus}
        </span>
      </div>
      <p className="my-4 leading-relaxed text-neutral-400">
        {persistence.isError
          ? "Could not check storage protection. Reopen this dialog to try again."
          : persistence.isPending
            ? "Checking whether your browser protects stored projects from automatic cleanup."
            : persisted === undefined
              ? "This browser does not make the storage protection control available. You can still save and export projects."
              : persisted
                ? "Your browser has enabled protection against automatic cleanup for this site's stored projects."
                : "Ask your browser to keep this site's projects when it automatically frees storage space."}
      </p>
      {persisted === false && !persistence.isError && (
        <Button
          disabled={protect.isPending}
          onClick={() => protect.mutate()}
          className="border-emerald-600 bg-emerald-600 px-4 py-2.5 text-xs text-white hover:bg-emerald-500"
        >
          {protect.isPending ? "Requesting…" : "Protect stored projects"}
        </Button>
      )}
      {protect.isError && (
        <p role="alert" className="mt-3 leading-relaxed text-orange-300">
          Could not request protection. Try again.
        </p>
      )}
      {protect.isSuccess && protect.data === false && persisted === false && (
        <p role="status" className="mt-3 leading-relaxed text-orange-300">
          The browser did not enable protection. You can continue saving and
          export a backup.
        </p>
      )}
      <p className="mt-5 text-[11px] leading-relaxed text-neutral-400">
        Export projects to keep a separate backup. Clearing site data still
        deletes protected projects.
      </p>
    </div>
  );
}

function formatStorageBytes(bytes: number): { amount: string; unit: string } {
  if (bytes >= 1_000_000_000) {
    return { amount: (bytes / 1_000_000_000).toFixed(1), unit: "GB" };
  }
  if (bytes >= 1_000_000) {
    return { amount: (bytes / 1_000_000).toFixed(1), unit: "MB" };
  }
  return { amount: String(Math.ceil(bytes / 1_000)), unit: "kB" };
}
