import { z } from "zod";
import {
  DEFAULT_PIXELS_PER_BEAT,
  MAX_PIXELS_PER_BEAT,
  MIN_PIXELS_PER_BEAT,
} from "../timeline.ts";

const PREFERENCES_KEY = "toy-midi:recorder-preferences";

const recorderPreferencesSchema = z.object({
  timelinePixelsPerBeat: z
    .number()
    .min(MIN_PIXELS_PER_BEAT)
    .max(MAX_PIXELS_PER_BEAT),
  input: z
    .object({
      deviceId: z.string(),
      channel: z.number().int().nonnegative(),
      latencyCompensation: z.number().nonnegative().optional(),
    })
    .optional(),
});
type RecorderPreferences = z.infer<typeof recorderPreferencesSchema>;

const DEFAULT_PREFERENCES: RecorderPreferences = {
  timelinePixelsPerBeat: DEFAULT_PIXELS_PER_BEAT,
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
