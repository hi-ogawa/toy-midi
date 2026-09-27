import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";

export function BrowserStorageDialog() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
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
  const protectionLabel = persistence.isPending
    ? "Checking…"
    : persistence.isError || persisted === undefined
      ? "Unavailable"
      : protect.isPending
        ? "Requesting…"
        : persisted
          ? "Enabled"
          : "Enable";

  return (
    <div className="text-xs">
      <div className="flex h-9 items-center">
        {estimate.isError ? (
          <p className="text-neutral-400">Could not estimate storage usage</p>
        ) : estimate.isPending ? (
          <p className="text-neutral-400">Checking storage usage…</p>
        ) : formattedUsage ? (
          <p className="text-2xl font-medium text-neutral-100">
            ~{formattedUsage.amount} {formattedUsage.unit}{" "}
            <span className="text-xs font-normal text-neutral-400">
              used by this site
            </span>
          </p>
        ) : (
          <p className="text-neutral-400">Storage estimate unavailable</p>
        )}
      </div>
      <div className="mt-6 flex items-center justify-between gap-4">
        <h3 className="font-medium text-neutral-200">
          Automatic cleanup protection
        </h3>
        <Button
          disabled={
            persisted !== false || persistence.isError || protect.isPending
          }
          onClick={() => protect.mutate()}
          aria-live="polite"
          className="w-28 shrink-0 border-emerald-600 bg-emerald-600 px-3 py-2 text-xs text-white hover:bg-emerald-500"
        >
          {protectionLabel}
        </Button>
      </div>
      {persistence.isError && (
        <p role="alert" className="mt-3 leading-relaxed text-orange-300">
          Could not check storage protection. Reopen this dialog to try again.
        </p>
      )}
      {protect.isError && (
        <p role="alert" className="mt-3 leading-relaxed text-orange-300">
          Could not request protection. Try again.
        </p>
      )}
      {protect.isSuccess && protect.data === false && persisted === false && (
        <p role="status" className="mt-3 leading-relaxed text-orange-300">
          The browser did not enable protection. You can still save projects.
        </p>
      )}
      <p className="mt-5 text-[11px] leading-relaxed text-neutral-400">
        Export projects to keep a separate backup.
      </p>
    </div>
  );
}

const PERSISTENCE_KEY = ["browser-storage", "persistence"];
const ESTIMATE_KEY = ["browser-storage", "estimate"];

function useBrowserStorage() {
  const queryClient = useQueryClient();
  const persistence = useQuery({
    queryKey: PERSISTENCE_KEY,
    // Wrap optional API results because query data itself must be defined.
    queryFn: async () => {
      if (!navigator.storage?.persisted || !navigator.storage.persist) {
        return { persisted: undefined };
      }
      return { persisted: await navigator.storage.persisted() };
    },
    staleTime: 30_000,
    retry: false,
  });
  const estimate = useQuery({
    queryKey: ESTIMATE_KEY,
    queryFn: async () => ({
      estimate: await navigator.storage?.estimate?.(),
    }),
    retry: false,
  });
  const protect = useMutation({
    mutationFn: () => navigator.storage.persist(),
    onSuccess: (persisted) => {
      queryClient.setQueryData(PERSISTENCE_KEY, { persisted });
    },
    // Keep request failures beside the protection control instead of a toast.
    onError: () => {},
  });
  return { persistence, estimate, protect };
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
