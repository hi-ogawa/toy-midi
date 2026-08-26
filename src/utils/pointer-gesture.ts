export type PointerGesture<T> = {
  event: PointerEvent;
  data: T;
  deltaX: number;
  deltaY: number;
};

export type PointerGestureOptions<T> = {
  threshold?: number;
  onStart: (event: PointerEvent) => T;
  onClick: (gesture: PointerGesture<T>) => void;
  onDragStart: (gesture: PointerGesture<T>) => void;
  onDragMove: (gesture: PointerGesture<T>) => void;
  onDragEnd?: (gesture: PointerGesture<T>) => void;
  onCancel?: (gesture: PointerGesture<T> & { dragged: boolean }) => void;
};

export function listenPointerGesture<T>({
  element,
  threshold = 4,
  onStart,
  onClick,
  onDragStart,
  onDragMove,
  onDragEnd,
  onCancel,
}: PointerGestureOptions<T> & { element: HTMLElement }) {
  let active:
    | {
        pointerId: number;
        startX: number;
        startY: number;
        data: T;
        dragged: boolean;
      }
    | undefined;

  const createGesture = (
    event: PointerEvent,
    current: NonNullable<typeof active>,
  ) => ({
    event,
    data: current.data,
    deltaX: event.clientX - current.startX,
    deltaY: event.clientY - current.startY,
  });
  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || active) {
      return;
    }
    active = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      data: onStart(event),
      dragged: false,
    };
    element.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: PointerEvent) => {
    if (!active || active.pointerId !== event.pointerId) {
      return;
    }
    const gesture = createGesture(event, active);
    if (
      !active.dragged &&
      gesture.deltaX ** 2 + gesture.deltaY ** 2 >= threshold ** 2
    ) {
      active.dragged = true;
      onDragStart(gesture);
    }
    if (active.dragged) {
      onDragMove(gesture);
    }
  };
  const handlePointerUp = (event: PointerEvent) => {
    if (!active || active.pointerId !== event.pointerId) {
      return;
    }
    const current = active;
    active = undefined;
    const gesture = createGesture(event, current);
    if (current.dragged) {
      onDragEnd?.(gesture);
    } else {
      onClick(gesture);
    }
  };
  const handlePointerCancel = (event: PointerEvent) => {
    if (!active || active.pointerId !== event.pointerId) {
      return;
    }
    const current = active;
    active = undefined;
    onCancel?.({ ...createGesture(event, current), dragged: current.dragged });
  };

  element.addEventListener("pointerdown", handlePointerDown);
  element.addEventListener("pointermove", handlePointerMove);
  element.addEventListener("pointerup", handlePointerUp);
  element.addEventListener("pointercancel", handlePointerCancel);
  element.addEventListener("lostpointercapture", handlePointerCancel);
  return () => {
    element.removeEventListener("pointerdown", handlePointerDown);
    element.removeEventListener("pointermove", handlePointerMove);
    element.removeEventListener("pointerup", handlePointerUp);
    element.removeEventListener("pointercancel", handlePointerCancel);
    element.removeEventListener("lostpointercapture", handlePointerCancel);
  };
}
