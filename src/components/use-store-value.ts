import { type SetStateAction, useSyncExternalStore } from "react";
import type { Store } from "../utils/store";

/** A store with a React hook for one value, so components read it like state. */
export function withUseValue<State>(store: Store<State>) {
  return {
    ...store,
    useValue: <Key extends keyof State>(key: Key) => useStoreValue(store, key),
  };
}

/** Like useState, for one value of a store. */
function useStoreValue<State, Key extends keyof State>(
  store: Store<State>,
  key: Key,
): readonly [State[Key], (next: SetStateAction<State[Key]>) => void] {
  const value = useSyncExternalStore(store.subscribe, () => store.get()[key]);
  const setValue = (next: SetStateAction<State[Key]>) => {
    const change: Partial<State> = {};
    change[key] =
      typeof next === "function"
        ? (next as (value: State[Key]) => State[Key])(store.get()[key])
        : next;
    store.update(change);
  };
  return [value, setValue];
}
