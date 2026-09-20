import { useSyncExternalStore, type SetStateAction } from "react";
import {
  recorderPreferences,
  type RecorderPreferences,
} from "../../lib/recorder/storage";

export function useRecorderPreference<Key extends keyof RecorderPreferences>(
  key: Key,
) {
  const value = useSyncExternalStore(
    recorderPreferences.subscribe,
    () => recorderPreferences.get()[key],
  );

  function setValue(next: SetStateAction<RecorderPreferences[Key]>) {
    recorderPreferences.update((current) => ({
      [key]: typeof next === "function" ? next(current[key]) : next,
    }));
  }

  return [value, setValue] as const;
}
