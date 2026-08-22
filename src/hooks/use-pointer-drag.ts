import { useCallback, useEffectEvent } from "react";
import { listenPointerDrag } from "../utils/pointer-drag";

type PointerDragOptions<T> = {
  onStart: (event: PointerEvent) => T;
  onMove: (event: PointerEvent, data: T) => void;
  onEnd?: (event: PointerEvent, data: T) => void;
};

export function usePointerDrag<T>({
  onStart,
  onMove,
  onEnd,
}: PointerDragOptions<T>) {
  const handlePointerStart = useEffectEvent(onStart);
  const handlePointerMove = useEffectEvent(onMove);
  const handlePointerEnd = useEffectEvent(onEnd ?? (() => {}));

  return useCallback((element: HTMLElement | null) => {
    if (!element) {
      return;
    }
    return listenPointerDrag({
      element,
      onStart: handlePointerStart,
      onMove: handlePointerMove,
      onEnd: handlePointerEnd,
    });
  }, []);
}
