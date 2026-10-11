import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlertIcon, ShieldCheckIcon, ShieldIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { cn } from "./ui/utils";

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
  const usageBytes = estimate.data?.estimate?.usage;

  return (
    <BrowserStorageContent
      usage={
        estimate.isPending
          ? { status: "checking" }
          : usageBytes === undefined
            ? { status: "unavailable" }
            : { status: "ready", bytes: usageBytes }
      }
      protection={
        persistence.isPending
          ? "checking"
          : persistence.data?.persisted === undefined
            ? "unavailable"
            : persistence.data.persisted
              ? "on"
              : protect.isPending
                ? "requesting"
                : protect.isIdle
                  ? "off"
                  : "denied"
      }
      onRequestProtection={() => protect.mutate()}
    />
  );
}

type BrowserStorageUsage =
  | { status: "checking" }
  | { status: "ready"; bytes: number }
  | { status: "unavailable" };

type BrowserStorageProtection =
  | "checking"
  | "off"
  | "requesting"
  | "denied"
  | "on"
  | "unavailable";

export function BrowserStorageContent({
  usage,
  protection,
  onRequestProtection,
}: {
  usage: BrowserStorageUsage;
  protection: BrowserStorageProtection;
  onRequestProtection: () => void;
}) {
  return (
    <div className="space-y-5 text-sm">
      <UsageSummary usage={usage} />
      <ProtectionCard
        protection={protection}
        onRequestProtection={onRequestProtection}
      />
      <p className="text-xs leading-relaxed text-neutral-400">
        Export projects to keep a separate backup, and delete projects you no
        longer need to free up space.
      </p>
    </div>
  );
}

function UsageSummary({ usage }: { usage: BrowserStorageUsage }) {
  switch (usage.status) {
    case "checking": {
      return (
        <p className="flex h-8 items-center text-neutral-400">
          Checking storage usage…
        </p>
      );
    }
    case "ready": {
      return (
        <p className="flex h-8 items-baseline gap-2">
          <span className="text-2xl font-medium text-neutral-100 tabular-nums">
            {formatStorageBytes(usage.bytes)}
          </span>
          <span className="text-neutral-400">stored in this browser</span>
        </p>
      );
    }
    case "unavailable": {
      return (
        <p className="flex h-8 items-center text-neutral-400">
          Storage usage unavailable
        </p>
      );
    }
  }
}

function ProtectionCard({
  protection,
  onRequestProtection,
}: {
  protection: BrowserStorageProtection;
  onRequestProtection: () => void;
}) {
  const { Icon, iconClassName, title, description } =
    PROTECTION_CONTENT[protection];
  const canRequest =
    protection === "off" ||
    protection === "requesting" ||
    protection === "denied";

  return (
    <section className="rounded-lg border border-neutral-700 bg-neutral-900/40 p-4">
      <div className="flex gap-3">
        <Icon className={cn("mt-0.5 size-5 shrink-0", iconClassName)} />
        <div className="min-w-0 flex-1">
          <h3 className="text-neutral-100">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-neutral-400">
            {description}
          </p>
          {protection === "denied" && (
            <p
              role="status"
              className="mt-2 text-xs leading-relaxed text-orange-300"
            >
              The browser did not enable protection. You can still save
              projects.
            </p>
          )}
          {canRequest && (
            <Button
              disabled={protection === "requesting"}
              onClick={onRequestProtection}
              className="mt-3 border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-500"
            >
              {protection === "requesting"
                ? "Requesting…"
                : "Request protection"}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

const UNPROTECTED_DESCRIPTION =
  "When disk space runs low, the browser may delete all projects on this site at once.";

const PROTECTION_CONTENT = {
  checking: {
    Icon: ShieldIcon,
    iconClassName: "text-neutral-500",
    title: "Checking protection…",
    description: "Browsers can delete site data when disk space runs low.",
  },
  off: {
    Icon: ShieldAlertIcon,
    iconClassName: "text-orange-300",
    title: "Not protected from automatic cleanup",
    description: UNPROTECTED_DESCRIPTION,
  },
  requesting: {
    Icon: ShieldAlertIcon,
    iconClassName: "text-orange-300",
    title: "Not protected from automatic cleanup",
    description: UNPROTECTED_DESCRIPTION,
  },
  denied: {
    Icon: ShieldAlertIcon,
    iconClassName: "text-orange-300",
    title: "Not protected from automatic cleanup",
    description: UNPROTECTED_DESCRIPTION,
  },
  on: {
    Icon: ShieldCheckIcon,
    iconClassName: "text-emerald-400",
    title: "Protected from automatic cleanup",
    description:
      "The browser keeps your projects even when disk space runs low. Clearing site data in browser settings still removes them.",
  },
  unavailable: {
    Icon: ShieldIcon,
    iconClassName: "text-neutral-500",
    title: "Protection status unavailable",
    description: UNPROTECTED_DESCRIPTION,
  },
} satisfies Record<BrowserStorageProtection, unknown>;

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
    // A failed request shows as the denied state instead of a toast.
    onError: () => {},
  });
  return { persistence, estimate, protect };
}

function formatStorageBytes(bytes: number) {
  if (bytes >= 1_000_000_000) {
    return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  }
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
  }
  return `${Math.ceil(bytes / 1_000)} kB`;
}
