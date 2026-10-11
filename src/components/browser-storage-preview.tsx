import type { ComponentProps } from "react";
import { BrowserStorageContent } from "./browser-storage-dialog";

const USAGE = { status: "ready", bytes: 3_900_000_000 } as const;

const PRESETS: {
  label: string;
  props: Omit<
    ComponentProps<typeof BrowserStorageContent>,
    "onRequestProtection"
  >;
}[] = [
  {
    label: "Loading",
    props: { usage: { status: "checking" }, protection: "checking" },
  },
  { label: "Off", props: { usage: USAGE, protection: "off" } },
  { label: "Requesting", props: { usage: USAGE, protection: "requesting" } },
  { label: "Denied", props: { usage: USAGE, protection: "denied" } },
  { label: "On", props: { usage: USAGE, protection: "on" } },
  {
    label: "Unavailable",
    props: { usage: { status: "unavailable" }, protection: "unavailable" },
  },
];

export function BrowserStoragePreview() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(448px,1fr))] gap-6">
      {PRESETS.map((preset) => (
        <div key={preset.label} className="space-y-1">
          <p className="text-xs text-neutral-500">{preset.label}</p>
          {/* Static copy of the shared Dialog chrome so every state renders at once. */}
          <div className="w-md rounded-lg bg-neutral-800 shadow-2xl">
            <div className="border-b border-neutral-700 px-6 py-4 text-lg font-semibold text-neutral-100">
              Browser storage
            </div>
            <div className="p-6">
              <BrowserStorageContent
                {...preset.props}
                onRequestProtection={() => {}}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
