import JSZip from "jszip";
import { readProjectArchive } from "./project-archive";
import { convertSharedProject, createSharedProject } from "./project-share";
import { encodeWav } from "./wav";

/**
 * Helpers to compose with the runtime, kept off its API. `toy_midi_eval` has
 * them in scope as `utils`, and pages that set `window.toyMidi` put them there
 * too.
 */
export const toyMidiUtils = {
  /** Converts `runtime.serializeProject()` to the format of share links and project files. */
  createSharedProject,
  convertSharedProject,
  readProjectArchive: async (archive: Blob) =>
    readProjectArchive(await JSZip.loadAsync(archive)),
  encodeWav,
};

export type ToyMidiUtils = typeof toyMidiUtils;
