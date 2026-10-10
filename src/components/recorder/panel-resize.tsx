import { useState } from "react";
import { usePointerDrag } from "../../hooks/use-pointer-drag";
import { clamp } from "../../lib/music";

interface PanelSize {
  width: number;
  height: number;
}

/**
 * Resizes a panel docked at the bottom right by dragging its top-left corner,
 * and reports the size when a drag ends so the caller can save it.
 */
export function usePanelResize({
  initialSize,
  minSize,
  onResizeEnd,
}: {
  initialSize: PanelSize;
  minSize: PanelSize;
  onResizeEnd: (size: PanelSize) => void;
}) {
  function clampSize({ width, height }: PanelSize) {
    return {
      width: clamp(width, minSize.width, window.innerWidth - 32),
      height: clamp(height, minSize.height, window.innerHeight - 32),
    };
  }

  const [size, setSize] = useState(() => clampSize(initialSize));
  const handleRef = usePointerDrag({
    onStart: (event) => {
      const target = event.target;
      const panel = target instanceof HTMLElement ? target.offsetParent : null;
      if (!(panel instanceof HTMLElement)) {
        throw new Error("Resized panel is missing.");
      }
      return { panelRect: panel.getBoundingClientRect(), size };
    },
    onMove: (_event, { data, deltaX, deltaY }) => {
      data.size = clampSize({
        width: data.panelRect.width - deltaX,
        height: data.panelRect.height - deltaY,
      });
      setSize(data.size);
    },
    onEnd: (_event, { data }) => {
      onResizeEnd(data.size);
    },
  });
  return { size, handleRef };
}

export function PanelResizeHandle({
  handleRef,
  label,
  "data-testid": testId,
}: {
  handleRef: (element: HTMLElement | null) => void;
  label: string;
  "data-testid"?: string;
}) {
  return (
    <button
      ref={handleRef}
      type="button"
      aria-label={label}
      data-testid={testId}
      className="group absolute top-0 left-0 z-10 flex size-5 cursor-nwse-resize touch-none items-start justify-start p-1"
    >
      <span className="pointer-events-none size-2.5 border-t-2 border-l-2 border-neutral-500 transition-colors group-hover:border-neutral-200 group-active:border-emerald-400" />
    </button>
  );
}
