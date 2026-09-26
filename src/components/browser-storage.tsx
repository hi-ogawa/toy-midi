import { HardDriveIcon } from "lucide-react";
import { useBrowserStorage } from "../hooks/use-browser-storage";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export function BrowserStoragePanel() {
  const { persistence, estimate, protect } = useBrowserStorage();
  const persisted = persistence.data?.persisted;
  const usage = estimate.data?.estimate?.usage;
  const quota = estimate.data?.estimate?.quota;
  const protectionStatus = persistence.isError
    ? "Could not check protection"
    : persistence.isPending
      ? "Checking…"
      : persisted === undefined
        ? "Unavailable in this browser"
        : persisted
          ? "On"
          : "Off";

  return (
    <section aria-label="Browser storage" className="space-y-2 text-xs">
      <h3 className="font-medium text-neutral-200">Browser storage</h3>
      <p className="text-neutral-400">
        {estimate.isError
          ? "Could not estimate storage usage"
          : estimate.isPending
            ? "Checking storage usage…"
            : usage === undefined
              ? "Storage estimate unavailable"
              : `About ${formatStorageBytes(usage)} used by this site`}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-neutral-300" role="status">
          Automatic cleanup protection: {protectionStatus}
        </p>
        {persisted === false && (
          <Button
            disabled={protect.isPending}
            onClick={() => protect.mutate()}
            className="bg-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-600"
          >
            {protect.isPending ? "Requesting…" : "Protect stored projects"}
          </Button>
        )}
      </div>
      {protect.isError && (
        <p role="alert" className="text-orange-300">
          Could not request protection. Try again.
        </p>
      )}
      {protect.isSuccess && protect.data === false && persisted === false && (
        <p role="status" className="text-orange-300">
          The browser did not enable protection. You can continue saving and
          export a backup.
        </p>
      )}
      <p className="text-neutral-500">
        Export projects to keep a separate backup. Clearing site data still
        deletes protected projects.
      </p>
      {quota !== undefined && !estimate.isError && (
        <details className="text-neutral-500">
          <summary className="cursor-pointer hover:text-neutral-300">
            Storage details
          </summary>
          <p className="mt-1">
            Browser-reported quota (estimate): {formatStorageBytes(quota)}. This
            is not free disk space or a guarantee that a save will fit.
          </p>
        </details>
      )}
    </section>
  );
}

export function BrowserStoragePopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label="Browser storage"
          title="Browser storage"
          className="size-8 border-transparent bg-transparent text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        >
          <HardDriveIcon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-4">
        <BrowserStoragePanel />
      </PopoverContent>
    </Popover>
  );
}

function formatStorageBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) {
    return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  }
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
  }
  return `${Math.ceil(bytes / 1_000)} kB`;
}
