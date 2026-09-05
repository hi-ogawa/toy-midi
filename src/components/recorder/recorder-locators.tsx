import { PlusIcon } from "lucide-react";
import { useRef, useState } from "react";
import { usePointerGesture } from "../../hooks/use-pointer-gesture";
import { snapToGrid } from "../../lib/music";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";

type Locator = { id: string; beat: number; label: string };

// UI prototype only. Locators are discarded when the editor is unmounted.
export function useRecorderLocators() {
  const [items, setItems] = useState<Locator[]>([]);
  const [selectedId, select] = useState<string>();
  const nextNumber = useRef(1);

  function add(beat: number) {
    const locator = {
      id: crypto.randomUUID(),
      beat,
      label: `Section ${nextNumber.current++}`,
    };
    setItems((current) => [...current, locator]);
    select(locator.id);
  }

  function update(
    id: string,
    changes: Partial<Pick<Locator, "beat" | "label">>,
  ) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
  }

  function removeSelected() {
    setItems((current) => current.filter((item) => item.id !== selectedId));
    select(undefined);
  }

  return { items, selectedId, select, add, update, removeSelected };
}

export function RecorderLocatorRow({
  locators,
  pixelsPerBeat,
  viewportStartBeat,
  subdivisionsPerBeat,
  onAdd,
  onSelect,
  onSeek,
}: {
  locators: ReturnType<typeof useRecorderLocators>;
  pixelsPerBeat: number;
  viewportStartBeat: number;
  subdivisionsPerBeat: number;
  onAdd: () => void;
  onSelect: (id: string) => void;
  onSeek: (beat: number) => void;
}) {
  const sorted = [...locators.items].sort((a, b) => a.beat - b.beat);
  return (
    <div
      data-recorder-locators
      className="grid h-7 grid-cols-[15rem_1fr] border-b border-neutral-700 bg-neutral-800"
    >
      <div className="flex items-center justify-between border-r border-neutral-700 px-3 text-xs font-semibold text-neutral-400">
        <span>Locators</span>
        <Button
          title="Add locator at playhead (L)"
          aria-label="Add locator at playhead"
          className="size-6 hover:bg-neutral-700"
          onClick={onAdd}
        >
          <PlusIcon className="size-3.5" />
        </Button>
      </div>
      <div
        className="relative overflow-hidden"
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          locators.select(undefined);
          const rect = event.currentTarget.getBoundingClientRect();
          onSeek(
            Math.max(
              0,
              snapToGrid(
                viewportStartBeat + (event.clientX - rect.left) / pixelsPerBeat,
                1 / subdivisionsPerBeat,
              ),
            ),
          );
        }}
      >
        {sorted.map((locator, index) => (
          <LocatorMarker
            key={locator.id}
            locator={locator}
            selected={locators.selectedId === locator.id}
            left={(locator.beat - viewportStartBeat) * pixelsPerBeat}
            labelWidth={Math.min(
              160,
              Math.max(
                0,
                ((sorted[index + 1]?.beat ?? Infinity) - locator.beat) *
                  pixelsPerBeat -
                  14,
              ),
            )}
            pixelsPerBeat={pixelsPerBeat}
            subdivisionsPerBeat={subdivisionsPerBeat}
            onSelect={() => {
              onSelect(locator.id);
              onSeek(locator.beat);
            }}
            onUpdate={(changes) => locators.update(locator.id, changes)}
          />
        ))}
      </div>
    </div>
  );
}

function LocatorMarker({
  locator,
  selected,
  left,
  labelWidth,
  pixelsPerBeat,
  subdivisionsPerBeat,
  onSelect,
  onUpdate,
}: {
  locator: Locator;
  selected: boolean;
  left: number;
  labelWidth: number;
  pixelsPerBeat: number;
  subdivisionsPerBeat: number;
  onSelect: () => void;
  onUpdate: (changes: Partial<Pick<Locator, "beat" | "label">>) => void;
}) {
  const [draft, setDraft] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const cancelled = useRef(false);
  const dragRef = usePointerGesture({
    onStart: (event) => {
      event.preventDefault();
      event.stopPropagation();
      onSelect();
      return locator.beat;
    },
    onDragStart: () => setDragging(true),
    onDragMove: (_event, { data, deltaX }) => {
      onUpdate({
        beat: Math.max(
          0,
          snapToGrid(data + deltaX / pixelsPerBeat, 1 / subdivisionsPerBeat),
        ),
      });
    },
    onDragEnd: () => setDragging(false),
    onCancel: (_event, { data }) => {
      onUpdate({ beat: data });
      setDragging(false);
    },
  });

  function startRename() {
    cancelled.current = false;
    setDraft(locator.label);
    onSelect();
  }

  function finishRename() {
    if (!cancelled.current && draft?.trim()) {
      onUpdate({ label: draft.trim() });
    }
    setDraft(undefined);
  }

  return (
    <div
      className="absolute inset-y-0"
      style={{ left, zIndex: draft !== undefined ? 20 : selected ? 10 : 1 }}
    >
      <button
        ref={dragRef}
        type="button"
        aria-label={locator.label}
        aria-pressed={selected}
        title={`${locator.label}\nDrag to move · Double-click to rename · Delete to remove`}
        onClick={onSelect}
        onDoubleClick={startRename}
        className={cn(
          "group absolute inset-y-0 -left-1.5 flex w-max items-center gap-1 text-neutral-400 outline-none hover:text-sky-200 focus-visible:ring-1 focus-visible:ring-sky-300",
          selected && "text-sky-300",
          dragging ? "cursor-ew-resize" : "cursor-pointer",
        )}
      >
        <span className="mt-auto mb-1 size-0 shrink-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-current" />
        <span
          className={cn(
            "truncate rounded px-1 text-[11px] select-none group-hover:bg-neutral-700",
            selected && "bg-sky-300/20 text-sky-100",
          )}
          style={{ maxWidth: labelWidth }}
        >
          {locator.label}
        </span>
      </button>
      {draft !== undefined && (
        <input
          ref={focusRenameInput}
          aria-label="Locator name"
          className="absolute top-0.5 left-2 h-6 w-40 rounded border border-sky-300 bg-neutral-900 px-1 text-[11px] text-neutral-100 outline-none"
          value={draft}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={finishRename}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              event.preventDefault();
              finishRename();
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancelled.current = true;
              setDraft(undefined);
            }
          }}
        />
      )}
    </div>
  );
}

function focusRenameInput(element: HTMLInputElement | null) {
  element?.focus();
  element?.select();
}
