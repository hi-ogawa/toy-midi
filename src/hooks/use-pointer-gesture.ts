import { useCallback, useEffectEvent } from "react";
import {
  listenPointerGesture,
  type PointerGestureOptions,
} from "../utils/pointer-gesture";

export function usePointerGesture<T>(options: PointerGestureOptions<T>) {
  const onStart = useEffectEvent(options.onStart);
  const onClick = useEffectEvent(options.onClick ?? (() => {}));
  const onDragStart = useEffectEvent(options.onDragStart ?? (() => {}));
  const onDragMove = useEffectEvent(options.onDragMove);
  const onDragEnd = useEffectEvent(options.onDragEnd ?? (() => {}));
  const onCancel = useEffectEvent(options.onCancel ?? (() => {}));

  return useCallback((element: HTMLElement | null) => {
    if (!element) {
      return;
    }
    return listenPointerGesture({
      element,
      threshold: options.threshold,
      onStart,
      onClick,
      onDragStart,
      onDragMove,
      onDragEnd,
      onCancel,
    });
  }, []);
}
