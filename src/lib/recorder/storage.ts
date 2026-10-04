import { z } from "zod";
import { LocalStorageStore } from "../../utils/local-storage-store";
import {
  DEFAULT_PIXELS_PER_BEAT,
  MAX_PIXELS_PER_BEAT,
  MIN_PIXELS_PER_BEAT,
} from "../timeline.ts";

const PREFERENCES_KEY = "toy-midi:recorder-preferences";

// Preferences that follow the browser, such as the input hardware.
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

export const recorderStorage = new LocalStorageStore<RecorderPreferences>({
  key: PREFERENCES_KEY,
  schema: recorderPreferencesSchema,
  defaults: { defaultMidiProgram: 0, takesNewestFirst: true },
});

const panelSizeSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
});

// View state for one project that stays in this browser, outside the saved
// project, so changing it never marks the project unsaved.
const projectClientStateSchema = z.object({
  autoScrollEnabled: z.boolean(),
  inputPanelOpen: z.boolean(),
  timelinePixelsPerBeat: z
    .number()
    .min(MIN_PIXELS_PER_BEAT)
    .max(MAX_PIXELS_PER_BEAT),
  referenceVideoSize: panelSizeSchema.optional(),
  timelineStartBeat: z.number().nonnegative(),
  /** Absent until stored, so a project opens at its start the first time. */
  playhead: z.number().nonnegative().optional(),
  referenceVideoOpen: z.boolean(),
  mixerOpen: z.boolean(),
  /** Track ids. A deleted track's id stays harmlessly, since nothing matches it. */
  expandedClipTracks: z.array(z.string()),
  openEffects: z.array(z.string()),
  openScorePanels: z.array(z.string()),
  effectsSize: panelSizeSchema.optional(),
  scorePanelSize: panelSizeSchema.optional(),
});
type ProjectClientState = z.infer<typeof projectClientStateSchema>;

export type ProjectClientStorage = LocalStorageStore<ProjectClientState>;

export function createProjectClientStorage(
  projectId: string,
): ProjectClientStorage {
  return new LocalStorageStore<ProjectClientState>({
    key: `toy-midi:recorder-project-client:${projectId}`,
    schema: projectClientStateSchema,
    defaults: {
      autoScrollEnabled: true,
      inputPanelOpen: false,
      timelinePixelsPerBeat: DEFAULT_PIXELS_PER_BEAT,
      timelineStartBeat: 0,
      referenceVideoOpen: false,
      mixerOpen: false,
      expandedClipTracks: [],
      openEffects: [],
      openScorePanels: [],
    },
  });
}
