import { useRef, useState, type ReactNode } from "react";
import { usePointerGesture } from "../../hooks/use-pointer-gesture";
import { useWindowEvent } from "../../hooks/use-window-event";

type Point = { x: number; y: number };
type Box = { left: number; top: number; width: number; height: number };

export function RecorderClipBoxSelection({
  children,
  onStart,
  onSelect,
}: {
  children: ReactNode;
  onStart: () => void;
  onSelect: (ids: Set<string>) => void;
}) {
  const [box, setBox] = useState<Box>();
  const active = useRef(false);

  // Escape cancels the gesture without replacing the previous clip selection.
  useWindowEvent(
    "keydown",
    (event) => {
      if (event.key === "Escape" && active.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
        active.current = false;
        setBox(undefined);
      }
    },
    true,
  );

  const ref = usePointerGesture({
    shouldStart: (event) =>
      event.shiftKey &&
      event.target instanceof HTMLElement &&
      !!event.target.closest("[data-clip-selection-lane]") &&
      !event.target.closest("[data-clip-selection-id]"),
    onStart: (event) => {
      event.preventDefault();
      active.current = true;
      onStart();
      const container = event.currentTarget as HTMLElement;
      return { container, start: getPosition({ event, container }) };
    },
    onDragMove: (event, { data }) => {
      if (active.current) {
        setBox(
          getBox({
            start: data.start,
            end: getPosition({ event, container: data.container }),
          }),
        );
      }
    },
    onDragEnd: (event, { data }) => {
      if (!active.current) {
        return;
      }
      const selection = getBox({
        start: data.start,
        end: getPosition({ event, container: data.container }),
      });
      const origin = data.container.getBoundingClientRect();
      const ids = new Set<string>();
      // Use editable source bounds, clipped to their lane, and deduplicate
      // sources that appear in both the capture lane and expanded take lanes.
      for (const element of data.container.querySelectorAll<HTMLElement>(
        "[data-clip-selection-id]",
      )) {
        const rect = element.getBoundingClientRect();
        const lane = element
          .closest("[data-clip-selection-lane]")!
          .getBoundingClientRect();
        const left = Math.max(rect.left, lane.left) - origin.left;
        const right = Math.min(rect.right, lane.right) - origin.left;
        const top = Math.max(rect.top, lane.top) - origin.top;
        const bottom = Math.min(rect.bottom, lane.bottom) - origin.top;
        if (
          left < right &&
          top < bottom &&
          left < selection.left + selection.width &&
          selection.left < right &&
          top < selection.top + selection.height &&
          selection.top < bottom
        ) {
          ids.add(element.dataset.clipSelectionId!);
        }
      }
      onSelect(ids);
      active.current = false;
      setBox(undefined);
    },
    onClick: () => {
      if (active.current) {
        onSelect(new Set());
      }
      active.current = false;
      setBox(undefined);
    },
    onCancel: () => {
      active.current = false;
      setBox(undefined);
    },
  });

  return (
    <div ref={ref} className="relative">
      {children}
      {box && (
        <div
          data-testid="recorder-clip-box-selection"
          className="pointer-events-none absolute z-40 border border-blue-300 bg-blue-400/20"
          style={box}
        />
      )}
    </div>
  );
}

function getPosition({
  event,
  container,
}: {
  event: PointerEvent;
  container: HTMLElement;
}): Point {
  const rect = container.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function getBox({ start, end }: { start: Point; end: Point }): Box {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}
