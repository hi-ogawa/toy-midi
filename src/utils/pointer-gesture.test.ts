import { afterEach, describe, expect, test, vi } from "vitest";
import { listenPointerGesture } from "./pointer-gesture";

function createListener({
  onClick,
  onDoubleClick,
}: {
  onClick: () => void;
  onDoubleClick?: () => void;
}) {
  const listeners = new Map<string, EventListener>();
  const element = {
    addEventListener: (type: string, listener: EventListener) => {
      listeners.set(type, listener);
    },
    removeEventListener: vi.fn(),
    setPointerCapture: vi.fn(),
  } as unknown as HTMLElement;
  const cleanup = listenPointerGesture({
    element,
    onStart: () => undefined,
    onClick,
    onDoubleClick,
    onDragMove: () => {},
  });
  const click = () => {
    const pointerEvent = {
      button: 0,
      clientX: 0,
      clientY: 0,
      pointerId: 1,
    } as PointerEvent;
    listeners.get("pointerdown")?.(pointerEvent);
    listeners.get("pointerup")?.(pointerEvent);
  };
  const doubleClick = () => {
    listeners.get("dblclick")?.({} as MouseEvent);
  };
  return { cleanup, click, doubleClick };
}

describe("listenPointerGesture", () => {
  afterEach(() => vi.useRealTimers());

  test("reports clicks immediately without a double-click handler", () => {
    const onClick = vi.fn();
    const listener = createListener({ onClick });

    listener.click();

    expect(onClick).toHaveBeenCalledOnce();
    listener.cleanup();
  });

  test("defers a click when a double-click handler is present", () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    const listener = createListener({ onClick, onDoubleClick: vi.fn() });

    listener.click();
    expect(onClick).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);

    expect(onClick).toHaveBeenCalledOnce();
    listener.cleanup();
  });

  test("reports a double-click without reporting its first click", () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    const onDoubleClick = vi.fn();
    const listener = createListener({ onClick, onDoubleClick });

    listener.click();
    listener.click();
    listener.doubleClick();
    vi.runAllTimers();

    expect(onClick).not.toHaveBeenCalled();
    expect(onDoubleClick).toHaveBeenCalledOnce();
    listener.cleanup();
  });

  test("reports a late native double-click after the deferred click", () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    const onDoubleClick = vi.fn();
    const listener = createListener({ onClick, onDoubleClick });

    listener.click();
    vi.advanceTimersByTime(150);
    listener.doubleClick();

    expect(onClick).toHaveBeenCalledOnce();
    expect(onDoubleClick).toHaveBeenCalledOnce();
    listener.cleanup();
  });

  test("cancels a deferred click during cleanup", () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    const listener = createListener({ onClick, onDoubleClick: vi.fn() });

    listener.click();
    listener.cleanup();
    vi.runAllTimers();

    expect(onClick).not.toHaveBeenCalled();
  });
});
