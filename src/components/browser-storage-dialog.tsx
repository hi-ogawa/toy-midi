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
          ? "Protection enabled"
          : "Protect stored projects";

  return (
    <div className="text-xs">
      <p className="text-neutral-400">Used by this site</p>
      <div className="my-2 flex h-9 items-center">
        {estimate.isError ? (
          <p className="text-neutral-400">Could not estimate storage usage</p>
        ) : estimate.isPending ? (
          <p className="text-neutral-400">Checking storage usage…</p>
        ) : formattedUsage ? (
          <p className="text-3xl font-medium tracking-tight text-neutral-100">
            {formattedUsage.amount}{" "}
            <span className="text-base font-normal tracking-normal text-neutral-400">
              {formattedUsage.unit}
            </span>
          </p>
        ) : (
          <p className="text-neutral-400">Storage estimate unavailable</p>
        )}
      </div>
      <p className="mt-2 text-neutral-500">
        Estimated total, including any legacy project data.
      </p>
      <div className="my-6 border-t border-neutral-700" />
      <h3 className="font-medium text-neutral-200">
        Automatic cleanup protection
      </h3>
      <p className="my-4 leading-relaxed text-neutral-400">
        Protection keeps this site's projects from being removed during
        automatic browser cleanup.
      </p>
      <Button
        disabled={
          persisted !== false || persistence.isError || protect.isPending
        }
        onClick={() => protect.mutate()}
        aria-live="polite"
        className="w-44 border-emerald-600 bg-emerald-600 px-4 py-2.5 text-xs text-white hover:bg-emerald-500"
      >
        {protectionLabel}
      </Button>
      {persistence.isError ? (
        <p role="alert" className="mt-3 leading-relaxed text-orange-300">
          Could not check storage protection. Reopen this dialog to try again.
        </p>
      ) : persistence.isSuccess && persisted === undefined ? (
        <p className="mt-3 leading-relaxed text-neutral-400">
          This browser does not offer storage protection. You can still save and
          export projects.
        </p>
      ) : undefined}
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
