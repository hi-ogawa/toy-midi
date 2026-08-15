type PointerDragOptions = {
  element: HTMLElement;
  onStart: () => void;
  onMove: (delta: { deltaX: number; deltaY: number }) => void;
};

export function listenPointerDrag({
  element,
  onStart,
  onMove,
}: PointerDragOptions) {
  let drag: { pointerId: number; x: number; y: number } | undefined;

  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || drag) {
      return;
    }
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    element.setPointerCapture(event.pointerId);
    onStart();
  };
  const handlePointerMove = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    onMove({
      deltaX: event.clientX - drag.x,
      deltaY: event.clientY - drag.y,
    });
  };
  const handlePointerEnd = (event: PointerEvent) => {
    // Only the pointer that started the drag may end it.
    if (drag?.pointerId === event.pointerId) {
      drag = undefined;
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
