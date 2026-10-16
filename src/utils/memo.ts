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
