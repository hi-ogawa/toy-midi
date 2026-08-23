export function createStore<State>(initialize: (get: () => State) => State) {
  let state: State;
  const listeners = new Set<() => void>();

  const get = (): State => state;
  state = initialize(get);

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const update = (update: Partial<State>): void => {
    state = { ...state, ...update };
    for (const listener of listeners) {
      listener();
    }
  };

  return { get, subscribe, update };
}
