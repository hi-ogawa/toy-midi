import { useSyncExternalStore, type SetStateAction } from "react";
import { preferencesStorage, type Preferences } from "../lib/preferences";

export function usePreference<Key extends keyof Preferences>(key: Key) {
  const value = useSyncExternalStore(
    preferencesStorage.store.subscribe,
    () => preferencesStorage.store.get()[key],
  );

  function setValue(next: SetStateAction<Preferences[Key]>) {
    preferencesStorage.update({
      [key]:
        typeof next === "function"
          ? next(preferencesStorage.store.get()[key])
          : next,
    });
  }

  return [value, setValue] as const;
}
