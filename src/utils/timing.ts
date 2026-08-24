// Copied from ../acpella/src/utils/timing.ts.
export function debounce(fn: () => void, ms: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  function schedule() {
    cancel();
    timeout = setTimeout(() => {
      timeout = undefined;
      fn();
    }, ms);
  }

  function cancel() {
    if (typeof timeout !== "undefined") {
      clearTimeout(timeout);
      timeout = undefined;
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

export function startAnimationFrameLoop(
  callback: FrameRequestCallback,
): () => void {
  let frame: number;
  const tick = (time: number) => {
    callback(time);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

export function startThrottledAnimationFrameLoop({
  callback,
  interval,
}: {
  callback: FrameRequestCallback;
  interval: number;
}): () => void {
  let lastTime = -Infinity;
  return startAnimationFrameLoop((time) => {
    if (time - lastTime < interval) {
      return;
    }
    lastTime = time;
    callback(time);
  });
}
