import { z } from "zod";

const PREFERENCES_KEY = "toy-midi:recorder-preferences";

const recorderPreferencesSchema = z.object({
  inputDeviceId: z.string().optional(),
  inputChannel: z.number().int().nonnegative(),
});
type RecorderPreferences = z.infer<typeof recorderPreferencesSchema>;

const DEFAULT_PREFERENCES: RecorderPreferences = {
  inputChannel: 0,
};

class RecorderStorage {
  readPreferences(): RecorderPreferences {
    try {
      const stored = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "{}");
      return recorderPreferencesSchema.parse({
        ...DEFAULT_PREFERENCES,
        ...stored,
      });
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

  updatePreferences(updates: Partial<RecorderPreferences>): void {
    this.writePreferences({ ...this.readPreferences(), ...updates });
  }
}

export const recorderStorage = new RecorderStorage();
