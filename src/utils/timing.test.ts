import { afterEach, describe, expect, it, vi } from "vitest";
import { debounce } from "./timing";

afterEach(() => {
  vi.useRealTimers();
});

describe("debounce", () => {
  it("runs after the trailing wait from the latest schedule", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debouncer = debounce(fn, { wait: 100, maxWait: 1_000 });

    debouncer.schedule();
    vi.advanceTimersByTime(50);
    debouncer.schedule();
    vi.advanceTimersByTime(99);

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(fn).toHaveBeenCalledOnce();
  });

  it("runs at the maximum wait while schedules continue", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debouncer = debounce(fn, { wait: 100, maxWait: 250 });

    debouncer.schedule();
    vi.advanceTimersByTime(90);
    debouncer.schedule();
    vi.advanceTimersByTime(90);
    debouncer.schedule();
    vi.advanceTimersByTime(69);

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(fn).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("flushes pending work immediately", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debouncer = debounce(fn, { wait: 100, maxWait: 250 });

    debouncer.schedule();
    debouncer.flush();

    expect(fn).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(fn).toHaveBeenCalledOnce();
  });
});
