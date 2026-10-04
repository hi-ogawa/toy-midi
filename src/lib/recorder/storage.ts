import { z } from "zod";
import { LocalStorageStore } from "../../utils/local-storage-store";
import {
  DEFAULT_PIXELS_PER_BEAT,
  MAX_PIXELS_PER_BEAT,
  MIN_PIXELS_PER_BEAT,
} from "../timeline.ts";

// Browser-wide preferences, which follow the browser into every project, such
// as the input hardware.

const recorderPreferencesSchema = z.object({
  defaultMidiProgram: z.number().int().min(0).max(127),
  takesNewestFirst: z.boolean(),
  input: z
    .object({
      deviceId: z.string(),
      channel: z.number().int().nonnegative(),
      latencyCompensation: z.number().nonnegative().optional(),
    })
    .optional(),
});
type RecorderPreferences = z.infer<typeof recorderPreferencesSchema>;

const DEFAULT_RECORDER_PREFERENCES: RecorderPreferences = {
  defaultMidiProgram: 0,
  takesNewestFirst: true,
};

export const recorderStorage = new LocalStorageStore<RecorderPreferences>({
  key: "toy-midi:recorder-preferences",
  parse: (stored) =>
    parseState({
      schema: recorderPreferencesSchema,
      defaults: DEFAULT_RECORDER_PREFERENCES,
      stored,
    }),
});

// Per-project client state, which stays in this browser outside the saved
// project, so changing it never marks the project unsaved.

const projectClientStateSchema = z.object({
  autoScrollEnabled: z.boolean(),
  inputPanelOpen: z.boolean(),
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
});
type ProjectClientState = z.infer<typeof projectClientStateSchema>;

const DEFAULT_PROJECT_CLIENT_STATE: ProjectClientState = {
  autoScrollEnabled: true,
  inputPanelOpen: false,
  timelinePixelsPerBeat: DEFAULT_PIXELS_PER_BEAT,
};

export type ProjectClientStorage = LocalStorageStore<ProjectClientState>;

export function createProjectClientStorage(
  projectId: string,
): ProjectClientStorage {
  return new LocalStorageStore<ProjectClientState>({
    key: `toy-midi:recorder-project-client:${projectId}`,
    parse: (stored) =>
      parseState({
        schema: projectClientStateSchema,
        defaults: DEFAULT_PROJECT_CLIENT_STATE,
        stored,
      }),
  });
}

/**
 * Fill the stored state over its defaults, which covers keys added by a later
 * build, and fall back to the defaults when it does not validate.
 */
function parseState<State>({
  schema,
  defaults,
  stored,
}: {
  schema: z.ZodType<State>;
  defaults: State;
  stored: unknown;
}): State {
  const result = schema.safeParse({ ...defaults, ...(stored as object) });
  return result.success ? result.data : defaults;
}
