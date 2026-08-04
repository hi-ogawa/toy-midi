// Copied from ../acpella/src/utils/timing.ts.
export function debounce(
  fn: () => void,
  { wait, maxWait }: { wait: number; maxWait?: number },
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let maxTimeout: ReturnType<typeof setTimeout> | undefined;

  function schedule() {
    if (typeof timeout !== "undefined") {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      cancel();
      fn();
    }, wait);
    if (typeof maxWait !== "undefined") {
      maxTimeout ??= setTimeout(() => {
        cancel();
        fn();
      }, maxWait);
    }
  }

  function cancel() {
    if (typeof timeout !== "undefined") {
      clearTimeout(timeout);
      timeout = undefined;
    }
    if (typeof maxTimeout !== "undefined") {
      clearTimeout(maxTimeout);
      maxTimeout = undefined;
    }
  }

  function flush() {
    const shouldRun = typeof timeout !== "undefined";
    cancel();
    if (shouldRun) {
      fn();
    }
  }

  return { schedule, cancel, flush };
}
