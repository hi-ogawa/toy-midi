import { z } from "zod";
import { createStore } from "../../utils/store";
import {
  DEFAULT_PIXELS_PER_BEAT,
  MAX_PIXELS_PER_BEAT,
  MIN_PIXELS_PER_BEAT,
} from "../timeline.ts";

const PREFERENCES_KEY = "toy-midi:recorder-preferences";

const recorderPreferencesSchema = z.object({
  autoScrollEnabled: z.boolean(),
  inputPanelOpen: z.boolean(),
  defaultMidiProgram: z.number().int().min(0).max(127),
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
export type RecorderPreferences = z.infer<typeof recorderPreferencesSchema>;

const DEFAULT_PREFERENCES: RecorderPreferences = {
  autoScrollEnabled: true,
  inputPanelOpen: false,
  defaultMidiProgram: 0,
  takesNewestFirst: true,
  timelinePixelsPerBeat: DEFAULT_PIXELS_PER_BEAT,
};

class RecorderStorage {
  // All consumers share one snapshot, including when browser storage is unavailable.
  readonly store = createStore<RecorderPreferences>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "{}");
      return recorderPreferencesSchema.parse({
        ...DEFAULT_PREFERENCES,
        ...stored,
      });
    } catch {
      return DEFAULT_PREFERENCES;
    }
  });

  update(updates: Partial<RecorderPreferences>): void {
    this.store.update(updates);
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(this.store.get()));
    } catch {
      // Storage can be disabled without preventing recording.
    }
  }
}

export const recorderStorage = new RecorderStorage();
