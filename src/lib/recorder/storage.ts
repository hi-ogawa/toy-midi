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

export const recorderPreferences = new LocalStorageStore<RecorderPreferences>({
  key: "toy-midi:recorder-preferences",
  parse: (stored) =>
    parseState({
      schema: recorderPreferencesSchema,
      defaults: DEFAULT_RECORDER_PREFERENCES,
      stored,
    }),
});

// Per-project UI state, such as zoom and panel layout, which stays in this
// browser outside the saved project, so changing it never marks the project
// unsaved.

const projectUiStateSchema = z.object({
  autoScrollEnabled: z.boolean(),
  inputPanelOpen: z.boolean(),
  timelinePixelsPerBeat: z
    .number()
    .min(MIN_PIXELS_PER_BEAT)
    .max(MAX_PIXELS_PER_BEAT),
  referenceVideoSize: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  timelineStartBeat: z.number().nonnegative(),
  /** Absent until stored, so a project opens at its start the first time. */
  playhead: z.number().nonnegative().optional(),
  referenceVideoOpen: z.boolean(),
  mixerOpen: z.boolean(),
  /** Track ids. A deleted track's id stays harmlessly, since nothing matches it. */
  expandedClipTracks: z.array(z.string()),
  openEffects: z.array(z.string()),
});
type ProjectUiState = z.infer<typeof projectUiStateSchema>;

const DEFAULT_PROJECT_UI_STATE: ProjectUiState = {
  autoScrollEnabled: true,
  inputPanelOpen: false,
  timelinePixelsPerBeat: DEFAULT_PIXELS_PER_BEAT,
  referenceVideoSize: { width: 640, height: 480 },
  timelineStartBeat: 0,
  referenceVideoOpen: false,
  mixerOpen: false,
  expandedClipTracks: [],
  openEffects: [],
};

export type ProjectUiStore = LocalStorageStore<ProjectUiState>;

export function createProjectUiStore(projectId: string): ProjectUiStore {
  return new LocalStorageStore<ProjectUiState>({
    key: `toy-midi:recorder-project-ui:${projectId}`,
    parse: (stored) =>
      parseState({
        schema: projectUiStateSchema,
        defaults: DEFAULT_PROJECT_UI_STATE,
        stored,
      }),
  });
}

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
