import { type SetStateAction, useSyncExternalStore } from "react";
import type { Store } from "../utils/store";

/** Like useState, for one value of a store, changed through its `update`. */
export function useStoreValue<State, Key extends keyof State>(
  {
    store,
    update,
  }: {
    store: Store<State>;
    update: (change: Partial<State>) => void;
  },
  key: Key,
): readonly [State[Key], (next: SetStateAction<State[Key]>) => void] {
  const value = useSyncExternalStore(store.subscribe, () => store.get()[key]);
  const setValue = (next: SetStateAction<State[Key]>) => {
    const change: Partial<State> = {};
    change[key] =
      typeof next === "function"
        ? (next as (value: State[Key]) => State[Key])(store.get()[key])
        : next;
    update(change);
  };
  return [value, setValue];
}
