import { useSyncExternalStore, type SetStateAction } from "react";
import {
  recorderStorage,
  type RecorderPreferences,
} from "../../lib/recorder/storage";

export function useRecorderPreference<Key extends keyof RecorderPreferences>(
  key: Key,
) {
  const value = useSyncExternalStore(
    recorderStorage.store.subscribe,
    () => recorderStorage.store.get()[key],
  );

  function setValue(next: SetStateAction<RecorderPreferences[Key]>) {
    recorderStorage.update({
      [key]:
        typeof next === "function"
          ? next(recorderStorage.store.get()[key])
          : next,
    });
  }

  return [value, setValue] as const;
}
