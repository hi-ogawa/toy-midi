export function throttle<Args extends unknown[]>(
  fn: (...args: Args) => void,
  ms: number,
) {
  let nextTime = -Infinity;

  function run(...args: Args) {
    const now = performance.now();
    if (now < nextTime) {
      return;
    }
    nextTime = now + ms;
    fn(...args);
  }

  function reset() {
    nextTime = performance.now() + ms;
  }

  return { run, reset };
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

export function startInterval(
  callback: () => void,
  milliseconds: number,
): () => void {
  const id = setInterval(callback, milliseconds);
  return () => clearInterval(id);
}
