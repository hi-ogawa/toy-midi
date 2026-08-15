type PointerDragOptions<T> = {
  element: HTMLElement;
  onStart: (event: PointerEvent) => T;
  onMove: (event: PointerEvent, data: T) => void;
  onEnd?: (event: PointerEvent, data: T) => void;
};

export function listenPointerDrag<T>({
  element,
  onStart,
  onMove,
  onEnd,
}: PointerDragOptions<T>) {
  let drag: { pointerId: number; data: T } | undefined;

  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || drag) {
      return;
    }
    drag = {
      pointerId: event.pointerId,
      data: onStart(event),
    };
    element.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    onMove(event, drag.data);
  };
  const handlePointerEnd = (event: PointerEvent) => {
    // Only the pointer that started the drag may end it.
    if (drag?.pointerId === event.pointerId) {
      const { data } = drag;
      drag = undefined;
      onEnd?.(event, data);
    }
  };

  element.addEventListener("pointerdown", handlePointerDown);
  element.addEventListener("pointermove", handlePointerMove);
  element.addEventListener("pointerup", handlePointerEnd);
  element.addEventListener("pointercancel", handlePointerEnd);
  element.addEventListener("lostpointercapture", handlePointerEnd);
  return () => {
    element.removeEventListener("pointerdown", handlePointerDown);
    element.removeEventListener("pointermove", handlePointerMove);
    element.removeEventListener("pointerup", handlePointerEnd);
    element.removeEventListener("pointercancel", handlePointerEnd);
    element.removeEventListener("lostpointercapture", handlePointerEnd);
  };
}
