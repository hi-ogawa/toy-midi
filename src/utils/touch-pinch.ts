export type TouchPinch = {
  /** Horizontal centroid of the active touches. */
  x: number;
  /** Distance between the first two touches, or 0 with a single touch. */
  distance: number;
};

export type TouchPinchOptions<T> = {
  accept: (event: PointerEvent) => boolean;
  onStart: (pinch: TouchPinch) => T;
  onMove: (pinch: TouchPinch, data: T) => void;
};

/**
 * Track touch pointers on `element` as one pan and pinch gesture. `onStart`
 * runs again whenever a touch is added or lifted, so the caller can re-anchor
 * without a jump.
 */
export function listenTouchPinch<T>({
  element,
  accept,
  onStart,
  onMove,
}: TouchPinchOptions<T> & { element: HTMLElement }) {
  const touches = new Map<number, { x: number; y: number }>();
  let data: T | undefined;

  const restart = () => {
    data = touches.size > 0 ? onStart(measurePinch(touches)) : undefined;
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (event.pointerType !== "touch" || !accept(event)) {
      return;
    }
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    restart();
  };
  const handlePointerMove = (event: PointerEvent) => {
    if (!touches.has(event.pointerId) || data === undefined) {
      return;
    }
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    onMove(measurePinch(touches), data);
  };
  const handlePointerEnd = (event: PointerEvent) => {
    if (touches.delete(event.pointerId)) {
      restart();
    }
  };

  element.addEventListener("pointerdown", handlePointerDown);
  element.addEventListener("pointermove", handlePointerMove);
  element.addEventListener("pointerup", handlePointerEnd);
  element.addEventListener("pointercancel", handlePointerEnd);
  return () => {
    element.removeEventListener("pointerdown", handlePointerDown);
    element.removeEventListener("pointermove", handlePointerMove);
    element.removeEventListener("pointerup", handlePointerEnd);
    element.removeEventListener("pointercancel", handlePointerEnd);
  };
}

function measurePinch(touches: Map<number, { x: number; y: number }>) {
  const points = [...touches.values()];
  const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const [a, b] = points;
  const distance = b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  return { x, distance };
}
