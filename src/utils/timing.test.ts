import { afterEach, describe, expect, it, vi } from "vitest";
import { throttle } from "./timing";

afterEach(() => {
  vi.useRealTimers();
});

describe("throttle", () => {
  it("runs on the leading edge and once more for pending work", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const throttler = throttle(fn, 100);

    throttler.schedule();
    expect(fn).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(50);
    throttler.schedule();
    throttler.schedule();
    expect(fn).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(50);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("runs once per interval while schedules continue", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const throttler = throttle(fn, 100);

    throttler.schedule();
    for (let elapsed = 10; elapsed < 300; elapsed += 10) {
      vi.advanceTimersByTime(10);
      throttler.schedule();
    }

    expect(fn).toHaveBeenCalledTimes(3);

    vi.advanceTimersByTime(10);
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("does not duplicate a leading call when no work is pending", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const throttler = throttle(fn, 100);

    throttler.schedule();
    vi.runAllTimers();

    expect(fn).toHaveBeenCalledOnce();
  });

  it("flushes pending work immediately", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const throttler = throttle(fn, 100);

    throttler.schedule();
    throttler.schedule();
    throttler.flush();

    expect(fn).toHaveBeenCalledTimes(2);
    vi.runAllTimers();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
