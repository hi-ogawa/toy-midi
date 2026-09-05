import { PencilIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { usePointerGesture } from "../../hooks/use-pointer-gesture";
import { snapToGrid } from "../../lib/music";
import type {
  RecorderRuntime,
  RecorderRuntimeState,
  RecorderLocator,
  RecorderLocatorUpdate,
} from "../../lib/recorder/runtime";
import { secondsToBeats } from "../../lib/timeline";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";

export function useRecorderLocators({
  runtime,
  state,
  subdivisionsPerBeat,
  onSelect,
}: {
  runtime: RecorderRuntime;
  state: RecorderRuntimeState;
  subdivisionsPerBeat: number;
  /** Only coordinates selection domains by clearing selection in the other domain. */
  onSelect: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string>();

  function add() {
    const beat = Math.max(
      0,
      snapToGrid(
        secondsToBeats(state.position, state.tempo),
        1 / subdivisionsPerBeat,
      ),
    );
    select(runtime.addLocator(beat));
  }

  function select(id: string | undefined) {
    if (id !== undefined) {
      onSelect();
    }
    setSelectedId(id);
  }

  function update(update: RecorderLocatorUpdate) {
    runtime.updateLocator(update);
  }

  function removeSelected() {
    if (selectedId !== undefined) {
      runtime.deleteLocator(selectedId);
    }
    select(undefined);
  }

  return {
    items: state.locators,
    selectedId,
    select,
    add,
    update,
    removeSelected,
  };
}

export function RecorderLocatorRow({
  locators,
  pixelsPerBeat,
  viewportStartBeat,
  subdivisionsPerBeat,
  onSeekBeat,
}: {
  locators: ReturnType<typeof useRecorderLocators>;
  pixelsPerBeat: number;
  viewportStartBeat: number;
  subdivisionsPerBeat: number;
  onSeekBeat: (beat: number) => void;
}) {
  return (
    <div className="grid h-7 grid-cols-[15rem_1fr] border-b border-neutral-700 bg-neutral-800">
      <div className="flex items-center justify-between border-r border-neutral-700 px-3 text-xs font-semibold text-neutral-400">
        <span>Locators</span>
        <Button
          title="Add locator at playhead (L)"
          aria-label="Add locator at playhead"
          className="size-6 hover:bg-neutral-700"
          onClick={locators.add}
        >
          <PlusIcon className="size-3.5" />
        </Button>
      </div>
      <div
        data-testid="recorder-locator-lane"
        className="relative overflow-hidden"
        onPointerDown={(event) => {
          if (event.button === 0) {
            locators.select(undefined);
          }
        }}
      >
        {locators.items.map((locator) => (
          <LocatorMarker
            key={locator.id}
            locator={locator}
            selected={locators.selectedId === locator.id}
            left={(locator.beat - viewportStartBeat) * pixelsPerBeat}
            pixelsPerBeat={pixelsPerBeat}
            subdivisionsPerBeat={subdivisionsPerBeat}
            onSelect={() => locators.select(locator.id)}
            onSeek={() => onSeekBeat(locator.beat)}
            onUpdate={(changes) =>
              locators.update({ id: locator.id, ...changes })
            }
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
  pixelsPerBeat,
  subdivisionsPerBeat,
  onSelect,
  onSeek,
  onUpdate,
}: {
  locator: RecorderLocator;
  selected: boolean;
  left: number;
  pixelsPerBeat: number;
  subdivisionsPerBeat: number;
  onSelect: () => void;
  onSeek: () => void;
  onUpdate: (changes: Omit<RecorderLocatorUpdate, "id">) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const dragRef = usePointerGesture({
    onStart: (event) => {
      event.preventDefault();
      event.stopPropagation();
      onSelect();
      return locator.beat;
    },
    onClick: onSeek,
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

  function rename() {
    const label = window.prompt("Rename locator:", locator.label)?.trim();
    if (label) {
      onUpdate({ label });
    }
  }

  return (
    <div
      className="group/locator absolute inset-y-0"
      style={{ left, zIndex: selected ? 10 : 1 }}
    >
      <div className="absolute inset-y-0 -left-1.5 flex w-max items-center gap-0.5 pl-4">
        <button
          ref={dragRef}
          type="button"
          aria-label={locator.label}
          aria-pressed={selected}
          title={`${locator.label}\nDrag to move · Delete to remove`}
          className={cn(
            "group flex h-full items-center text-neutral-400 outline-none hover:text-sky-200 focus-visible:ring-1 focus-visible:ring-sky-300",
            selected && "text-sky-300",
            dragging ? "cursor-ew-resize" : "cursor-pointer",
          )}
        >
          <span className="absolute bottom-1 left-0 size-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-current" />
          <span
            className={cn(
              "max-w-40 truncate rounded px-1 text-[11px] select-none group-hover:bg-neutral-700",
              selected && "bg-sky-300/20 text-sky-100",
            )}
          >
            <span className="translate-y-px">{locator.label}</span>
          </span>
        </button>
        <button
          type="button"
          aria-label={`Rename ${locator.label}`}
          title="Rename locator"
          onClick={rename}
          className={cn(
            "rounded p-0.5 text-neutral-500 opacity-0 outline-none hover:bg-neutral-700 hover:text-sky-200 focus-visible:ring-1 focus-visible:ring-sky-300 focus-visible:opacity-100 group-hover/locator:opacity-100",
            selected && "opacity-100",
          )}
        >
          <PencilIcon className="size-3" />
        </button>
      </div>
    </div>
  );
}
