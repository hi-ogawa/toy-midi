import { z } from "zod";
import { createStore } from "../utils/store";
import {
  DEFAULT_PIXELS_PER_BEAT,
  MAX_PIXELS_PER_BEAT,
  MIN_PIXELS_PER_BEAT,
} from "./timeline.ts";

const PREFERENCES_KEY = "toy-midi:recorder-preferences";

const preferencesSchema = z.object({
  autoScrollEnabled: z.boolean(),
  takesNewestFirst: z.boolean(),
  timelinePixelsPerBeat: z
    .number()
    .min(MIN_PIXELS_PER_BEAT)
    .max(MAX_PIXELS_PER_BEAT),
  referenceVideoSize: z
    .object({
      width: z.number().positive(),
      height: z.number().positive(),
    })
    .optional(),
  input: z
    .object({
      deviceId: z.string(),
      channel: z.number().int().nonnegative(),
      latencyCompensation: z.number().nonnegative().optional(),
    })
    .optional(),
});
export type Preferences = z.infer<typeof preferencesSchema>;

const DEFAULT_PREFERENCES: Preferences = {
  autoScrollEnabled: true,
  takesNewestFirst: true,
  timelinePixelsPerBeat: DEFAULT_PIXELS_PER_BEAT,
};

class PreferencesStorage {
  // All consumers share one snapshot, including when browser storage is unavailable.
  readonly store = createStore<Preferences>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "{}");
      return preferencesSchema.parse({
        ...DEFAULT_PREFERENCES,
        ...stored,
      });
    } catch {
      return DEFAULT_PREFERENCES;
    }
  });

  update(updates: Partial<Preferences>): void {
    this.store.update(updates);
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(this.store.get()));
    } catch {
      // Storage can be disabled without preventing recording.
    }
  }
}

export const preferencesStorage = new PreferencesStorage();
