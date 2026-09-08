import { Dialog } from "../ui/dialog";

type HelpSectionData = {
  title: string;
  items: { action: string; keys?: string; gesture?: string }[];
};

const sections: HelpSectionData[] = [
  {
    title: "Transport",
    items: [
      { action: "Play / pause", keys: "Space" },
      { action: "Start / stop recording", keys: "R" },
      { action: "Toggle metronome", keys: "M" },
    ],
  },
  {
    title: "Timeline",
    items: [
      { action: "Seek to a position", gesture: "Click ruler / empty lane" },
      { action: "Seek backward / forward 5 seconds", keys: "Left / Right" },
      {
        action: "Scroll timeline horizontally",
        gesture: "Wheel over timeline",
      },
      { action: "Zoom at pointer", keys: "Ctrl", gesture: " + wheel" },
      { action: "Toggle follow playhead", keys: "F" },
    ],
  },
  {
    title: "Clips",
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
  },
  {
    title: "Locators",
    items: [
      { action: "Add locator at playhead", keys: "L" },
      { action: "Select and seek to locator", gesture: "Click locator" },
      { action: "Move locator", gesture: "Drag locator" },
      {
        action: "Rename locator",
        gesture: "Hover / select, then click pencil",
      },
      { action: "Remove selected locator", keys: "Delete / Backspace" },
    ],
  },
  {
    title: "Project",
    items: [{ action: "Save project", keys: "Ctrl / Cmd + S" }],
  },
];

export function RecorderHelp({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Recorder quick reference"
      size="wide"
    >
      <div className="max-h-[calc(90vh-8rem)] overflow-y-auto">
        <div className="columns-2 gap-10">
          {sections.map((section) => (
            <HelpSection key={section.title} section={section} />
          ))}
        </div>
      </div>
    </Dialog>
  );
}

function HelpSection({ section }: { section: HelpSectionData }) {
  return (
    <section className="mb-7 break-inside-avoid">
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
              {item.keys && (
                <kbd className="whitespace-nowrap rounded border border-b-2 border-neutral-600 bg-neutral-700/60 px-1.5 py-0.5 font-sans text-[11px] text-neutral-300">
                  {item.keys}
                </kbd>
              )}
              {item.gesture}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
