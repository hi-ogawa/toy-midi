import { listenPointerDrag, type PointerDrag } from "./pointer-drag.ts";

const DRAG_THRESHOLD = 4;

export type PointerGesture<T> = PointerDrag<T>;

export type PointerGestureOptions<T> = {
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
  onStart,
  onClick,
  onDragStart,
  onDragMove,
  onDragEnd,
  onCancel,
}: PointerGestureOptions<T> & { element: HTMLElement }) {
  type State = {
    data: T;
    dragged: boolean;
  };

  return listenPointerDrag({
    element,
    onStart: (event): State => ({ data: onStart(event), dragged: false }),
    onMove: (event, { data: state, deltaX, deltaY }) => {
      const gesture = { data: state.data, deltaX, deltaY };
      if (
        !state.dragged &&
        gesture.deltaX ** 2 + gesture.deltaY ** 2 >= DRAG_THRESHOLD ** 2
      ) {
        state.dragged = true;
        onDragStart?.(event, gesture);
      }
      if (state.dragged) {
        onDragMove(event, gesture);
      }
    },
    onEnd: (event, { data: state, deltaX, deltaY }) => {
      const gesture = { data: state.data, deltaX, deltaY };
      if (state.dragged) {
        onDragEnd?.(event, gesture);
      } else {
        onClick?.(event, gesture);
      }
    },
    onCancel: (event, { data: state, deltaX, deltaY }) => {
      onCancel?.(event, { data: state.data, deltaX, deltaY }, state.dragged);
    },
  });
}
