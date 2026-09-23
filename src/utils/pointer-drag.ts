export type PointerDrag<T> = {
  data: T;
  deltaX: number;
  deltaY: number;
};

export type PointerDragOptions<T> = {
  onStart: (event: PointerEvent) => T;
  onMove: (event: PointerEvent, drag: PointerDrag<T>) => void;
  onEnd?: (event: PointerEvent, drag: PointerDrag<T>) => void;
  onCancel?: (event: PointerEvent, drag: PointerDrag<T>) => void;
};

export function listenPointerDrag<T>({
  element,
  onStart,
  onMove,
  onEnd,
  onCancel,
}: PointerDragOptions<T> & { element: HTMLElement }) {
  type State = {
    pointerId: number;
    startX: number;
    startY: number;
    data: T;
  };
  let state: State | undefined;

  const createDrag = (event: PointerEvent, state: State): PointerDrag<T> => ({
    data: state.data,
    deltaX: event.clientX - state.startX,
    deltaY: event.clientY - state.startY,
  });

  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || state) {
      return;
    }
    state = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      data: onStart(event),
    };
    element.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: PointerEvent) => {
    if (!state || state.pointerId !== event.pointerId) {
      return;
    }
    onMove(event, createDrag(event, state));
  };
  const handlePointerEnd = (event: PointerEvent) => {
    // Only the pointer that started the drag may end it.
    if (state?.pointerId === event.pointerId) {
      const drag = createDrag(event, state);
      state = undefined;
      onEnd?.(event, drag);
    }
  };
  const handlePointerCancel = (event: PointerEvent) => {
    if (state?.pointerId === event.pointerId) {
      const drag = createDrag(event, state);
      state = undefined;
      onCancel?.(event, drag);
    }
  };

  element.addEventListener("pointerdown", handlePointerDown);
  element.addEventListener("pointermove", handlePointerMove);
  element.addEventListener("pointerup", handlePointerEnd);
  element.addEventListener("pointercancel", handlePointerCancel);
  element.addEventListener("lostpointercapture", handlePointerCancel);
  return () => {
    element.removeEventListener("pointerdown", handlePointerDown);
    element.removeEventListener("pointermove", handlePointerMove);
    element.removeEventListener("pointerup", handlePointerEnd);
    element.removeEventListener("pointercancel", handlePointerCancel);
    element.removeEventListener("lostpointercapture", handlePointerCancel);
  };
}
