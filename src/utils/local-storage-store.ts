import { createStore, type Store } from "./store";

/**
 * A store mirrored to one localStorage entry, read once and written on each
 * update. `parse` turns the stored value, or undefined when there is none,
 * into the state.
 */
export function createLocalStorageStore<State>({
  key,
  parse,
}: {
  key: string;
  parse: (stored: unknown) => State;
}): Store<State> {
  const store = createStore<State>(() => {
    let stored: unknown;
    try {
      const json = localStorage.getItem(key);
      stored = json === null ? undefined : JSON.parse(json);
    } catch {}
    return parse(stored);
  });
  store.subscribe(() => {
    try {
      localStorage.setItem(key, JSON.stringify(store.get()));
    } catch {
      // Storage can be disabled without preventing recording.
    }
  });
  return store;
}
