import { expect, test, vi } from "vitest";
import { listenPointerDrag } from "./pointer-drag";

test("provides pointer displacement with drag data", () => {
  const element = new EventTarget() as HTMLElement;
  element.setPointerCapture = vi.fn();
  const onMove = vi.fn();
  const onEnd = vi.fn();
  const cleanup = listenPointerDrag({
    element,
    onStart: () => "drag data",
    onMove,
    onEnd,
  });

  element.dispatchEvent(createPointerEvent("pointerdown", 10, 20));
  const moveEvent = createPointerEvent("pointermove", 16, 12);
  element.dispatchEvent(moveEvent);
  const endEvent = createPointerEvent("pointerup", 18, 11);
  element.dispatchEvent(endEvent);

  expect(onMove).toHaveBeenCalledWith(moveEvent, {
    data: "drag data",
    deltaX: 6,
    deltaY: -8,
  });
  expect(onEnd).toHaveBeenCalledWith(endEvent, {
    data: "drag data",
    deltaX: 8,
    deltaY: -9,
  });
  cleanup();
});

function createPointerEvent(type: string, clientX: number, clientY: number) {
  return Object.assign(new Event(type), {
    button: 0,
    pointerId: 1,
    clientX,
    clientY,
  }) as PointerEvent;
}
