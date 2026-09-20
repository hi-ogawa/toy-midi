import { useCallback, useEffectEvent } from "react";
import { listenPointerDrag, PointerDragOptions } from "../utils/pointer-drag";

export function usePointerDrag<T>({
  shouldStart,
  onStart,
  onMove,
  onEnd,
  onCancel,
}: PointerDragOptions<T>) {
  const handleShouldStart = useEffectEvent(shouldStart ?? (() => true));
  const handlePointerStart = useEffectEvent(onStart);
  const handlePointerMove = useEffectEvent(onMove);
  const handlePointerEnd = useEffectEvent(onEnd ?? (() => {}));
  const handlePointerCancel = useEffectEvent(onCancel ?? (() => {}));

  return useCallback((element: HTMLElement | null) => {
    if (!element) {
      return;
    }
    return listenPointerDrag({
      element,
      shouldStart: handleShouldStart,
      onStart: handlePointerStart,
      onMove: handlePointerMove,
      onEnd: handlePointerEnd,
      onCancel: handlePointerCancel,
    });
  }, []);
}
