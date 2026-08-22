import { z } from "zod";

const PREFERENCES_KEY = "toy-midi:recorder-preferences";

const recorderPreferencesSchema = z.object({
  input: z
    .object({
      deviceId: z.string(),
      channel: z.number().int().nonnegative(),
    })
    .optional(),
});
type RecorderPreferences = z.infer<typeof recorderPreferencesSchema>;

const DEFAULT_PREFERENCES: RecorderPreferences = {};

class RecorderStorage {
  readPreferences(): RecorderPreferences {
    try {
      const stored = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "{}");
      return recorderPreferencesSchema.parse(stored);
    } catch {
      return DEFAULT_PREFERENCES;
    }
  }

  writePreferences(preferences: RecorderPreferences): void {
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    } catch {
      // Storage can be disabled without preventing recording.
    }
  }
}

export const recorderStorage = new RecorderStorage();
