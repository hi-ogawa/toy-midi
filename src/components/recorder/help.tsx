import { XIcon } from "lucide-react";
import { useEffect, useRef } from "react";

const sections: {
  title: string;
  items: { action: string; keys?: string; gesture?: string }[];
  note?: string;
}[] = [
  {
    title: "Play and record",
    items: [
      { action: "Play / pause", keys: "Space" },
      { action: "Start / stop recording", keys: "R" },
      { action: "Seek backward / forward 5 seconds", keys: "Left / Right" },
      { action: "Toggle metronome", keys: "M" },
    ],
    note: "Space also stops an active recording. Arrow-key seeking is unavailable while recording or processing.",
  },
  {
    title: "Move around",
    items: [
      {
        action: "Scroll timeline horizontally",
        gesture: "Wheel over timeline",
      },
      { action: "Zoom at pointer", keys: "Ctrl", gesture: " + wheel" },
      { action: "Seek to a position", gesture: "Click ruler / empty lane" },
      { action: "Toggle follow playhead", keys: "F" },
    ],
  },
  {
    title: "Work with clips",
    items: [
      { action: "Select a clip", gesture: "Click clip" },
      {
        action: "Add / remove from selection",
        keys: "Ctrl / Cmd",
        gesture: " + click",
      },
      { action: "Move selected clips", gesture: "Drag clip body" },
      { action: "Trim audio clips and takes", gesture: "Drag clip edge" },
      { action: "Remove selected clips", keys: "Delete / Backspace" },
      { action: "Clear selection", keys: "Esc" },
    ],
    note: "Drag a selected clip to move the group together.",
  },
  {
    title: "Mark and save",
    items: [
      { action: "Add locator at playhead", keys: "L" },
      { action: "Remove selected locator", keys: "Delete / Backspace" },
      { action: "Save project", keys: "Ctrl / Cmd + S" },
    ],
  },
];

const keyClassName =
  "whitespace-nowrap rounded border border-b-2 border-neutral-600 bg-neutral-700/60 px-1.5 py-0.5 font-sans text-[11px] text-neutral-300";

export function RecorderHelp({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current!;
    if (isOpen) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="recorder-help-title"
      className="fixed inset-0 m-auto max-h-[90vh] w-[960px] max-w-[calc(100vw-3rem)] overflow-y-auto rounded-xl border border-neutral-600 bg-neutral-800 p-0 text-neutral-100 shadow-2xl backdrop:bg-black/60"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div>
        <header className="flex items-start justify-between gap-5 border-b border-neutral-700 px-8 py-6">
          <div>
            <h2
              id="recorder-help-title"
              className="text-2xl font-semibold tracking-tight"
            >
              Recorder quick reference
            </h2>
            <p className="mt-2 text-[13px] text-neutral-400">
              The keys and gestures for recording, navigating, and editing.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help"
            className="text-neutral-400 hover:text-neutral-100"
          >
            <XIcon className="size-5" />
          </button>
        </header>
        <div className="grid grid-cols-2 gap-x-10 gap-y-7 px-8 py-7">
          {sections.map((section) => (
            <HelpSection key={section.title} section={section} />
          ))}
        </div>
      </div>
    </dialog>
  );
}

function HelpSection({ section }: { section: (typeof sections)[number] }) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-emerald-300">
        {section.title}
      </h3>
      <dl>
        {section.items.map((item) => (
          <div
            key={item.action}
            className="flex min-h-[34px] items-center justify-between gap-3"
          >
            <dt className="text-[13px] text-neutral-200">{item.action}</dt>
            <dd className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-neutral-400">
              {item.keys && <kbd className={keyClassName}>{item.keys}</kbd>}
              {item.gesture}
            </dd>
          </div>
        ))}
      </dl>
      {section.note && (
        <p className="mt-2 text-xs leading-relaxed text-neutral-400">
          {section.note}
        </p>
      )}
    </section>
  );
}
