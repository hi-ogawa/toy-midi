// Copied from ../acpella/src/utils/timing.ts.
export function throttle(fn: () => void, ms: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let pending = false;

  function schedule() {
    if (typeof timeout === "undefined") {
      timeout = setTimeout(runTrailing, ms);
      fn();
    } else {
      pending = true;
    }
  }

  function runTrailing() {
    timeout = undefined;
    if (pending) {
      pending = false;
      timeout = setTimeout(runTrailing, ms);
      fn();
    }
  }

  function cancel() {
    if (typeof timeout !== "undefined") {
      clearTimeout(timeout);
      timeout = undefined;
    }
    pending = false;
  }

  function flush() {
    const shouldRun = pending;
    cancel();
    if (shouldRun) {
      fn();
    }
  }

  return { schedule, cancel, flush };
}
