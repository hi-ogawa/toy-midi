export function memo<Input, Output>(fn: (input: Input) => Output) {
  const cache = new Map<Input, { value: Output }>();

  return (input: Input): Output => {
    const cached = cache.get(input);
    if (cached) {
      return cached.value;
    }
    const value = fn(input);
    cache.set(input, { value });
    return value;
  };
}

/** Like `memo`, but forgets a rejected promise so a later call retries. */
export function memoAsync<Input, Output>(
  fn: (input: Input) => Promise<Output>,
) {
  const cache = new Map<Input, Promise<Output>>();

  return (input: Input): Promise<Output> => {
    let promise = cache.get(input);
    if (!promise) {
      promise = fn(input);
      cache.set(input, promise);
      promise.catch(() => cache.delete(input));
    }
    return promise;
  };
}
