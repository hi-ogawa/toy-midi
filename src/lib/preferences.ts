import { z } from "zod";

// Based on https://github.com/hi-ogawa/demucs-onnx/blob/main/packages/app/src/lib/preferences.ts.
const STORAGE_KEY = "toy-midi:preferences";

const preferencesSchema = z.object({
  defaultMidiProgram: z.number().int().min(0).max(127),
});

export type Preferences = z.infer<typeof preferencesSchema>;

const DEFAULT_PREFERENCES: Preferences = {
  defaultMidiProgram: 0,
};

export function loadPreferences(): Preferences {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return preferencesSchema.parse({ ...DEFAULT_PREFERENCES, ...stored });
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(preferences: Preferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Storage can be disabled or unavailable without preventing editing.
  }
}
