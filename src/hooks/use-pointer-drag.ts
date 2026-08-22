import { useEffectEvent, useRef } from "react";

type PointerDragOptions<T> = {
  onStart: (event: React.PointerEvent<HTMLElement>) => T;
  onMove: (event: React.PointerEvent<HTMLElement>, data: T) => void;
  onEnd?: (event: React.PointerEvent<HTMLElement>, data: T) => void;
};

export function usePointerDrag<T>({
  onStart,
  onMove,
  onEnd,
}: PointerDragOptions<T>) {
  const dragRef = useRef<{ pointerId: number; data: T } | undefined>(undefined);
  const handlePointerDown = useEffectEvent(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || dragRef.current) {
        return;
      }
      dragRef.current = {
        pointerId: event.pointerId,
        data: onStart(event),
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
  );
  const handlePointerMove = useEffectEvent(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }
      onMove(event, drag.data);
    },
  );
  const handlePointerEnd = useEffectEvent(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (drag?.pointerId === event.pointerId) {
        dragRef.current = undefined;
        onEnd?.(event, drag.data);
      }
    },
  );

  return {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerEnd,
    onPointerCancel: handlePointerEnd,
    onLostPointerCapture: handlePointerEnd,
  };
}
