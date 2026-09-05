import { listenPointerDrag } from "./pointer-drag.ts";

export type PointerGesture<T> = {
  data: T;
  deltaX: number;
  deltaY: number;
};

export type PointerGestureOptions<T> = {
  threshold?: number;
  onStart: (event: PointerEvent) => T;
  onClick?: (event: PointerEvent, gesture: PointerGesture<T>) => void;
  onDragStart?: (event: PointerEvent, gesture: PointerGesture<T>) => void;
  onDragMove: (event: PointerEvent, gesture: PointerGesture<T>) => void;
  onDragEnd?: (event: PointerEvent, gesture: PointerGesture<T>) => void;
  onCancel?: (
    event: PointerEvent,
    gesture: PointerGesture<T>,
    dragged: boolean,
  ) => void;
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
  type State = {
    startX: number;
    startY: number;
    data: T;
    dragged: boolean;
  };
  const createGesture = (
    event: PointerEvent,
    state: State,
  ): PointerGesture<T> => ({
    data: state.data,
    deltaX: event.clientX - state.startX,
    deltaY: event.clientY - state.startY,
  });
  return listenPointerDrag({
    element,
    onStart: (event): State => ({
      startX: event.clientX,
      startY: event.clientY,
      data: onStart(event),
      dragged: false,
    }),
    onMove: (event, state) => {
      const gesture = createGesture(event, state);
      if (
        !state.dragged &&
        gesture.deltaX ** 2 + gesture.deltaY ** 2 >= threshold ** 2
      ) {
        state.dragged = true;
        onDragStart?.(event, gesture);
      }
      if (state.dragged) {
        onDragMove(event, gesture);
      }
    },
    onEnd: (event, state) => {
      const gesture = createGesture(event, state);
      if (state.dragged) {
        onDragEnd?.(event, gesture);
      } else {
        onClick?.(event, gesture);
      }
    },
    onCancel: (event, state) => {
      onCancel?.(event, createGesture(event, state), state.dragged);
    },
  });
}
