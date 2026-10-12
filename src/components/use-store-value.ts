import { type SetStateAction, useSyncExternalStore } from "react";
import type { Store } from "../utils/store";

/** Like useState, for one value of a store. */
export function useStoreValue<State, Key extends keyof State>(
  store: Store<State>,
  key: Key,
): readonly [State[Key], (next: SetStateAction<State[Key]>) => void] {
  const value = useSyncExternalStore(store.subscribe, () => store.get()[key]);
  const setValue = (next: SetStateAction<State[Key]>) => {
    const update: Partial<State> = {};
    update[key] =
      typeof next === "function"
        ? (next as (value: State[Key]) => State[Key])(store.get()[key])
        : next;
    store.update(update);
  };
  return [value, setValue];
}
